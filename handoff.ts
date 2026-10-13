import type { BarConfig } from './config'

export interface HandoffVideo {
  bvid: string
  cid: string
  page: number
  title: string
  duration: number
}

/** quarterBpm is always quarter-note tempo, including 6/8 and other meters. */
export const createBarlistTask = (
  config: BarConfig, video: HandoffVideo, firstBar = 1, lastBar?: number,
) => {
  if (!/^BV[0-9A-Za-z]{10}$/.test(video.bvid) || !/^[1-9][0-9]*$/.test(video.cid)) {
    throw new Error('无法读取当前视频 BV/cid，请等待视频加载完成')
  }
  if (![firstBar, video.page].every(Number.isInteger) ||
      firstBar < 1 || firstBar > 100000 ||
      (lastBar !== undefined && (!Number.isInteger(lastBar) || lastBar < firstBar || lastBar > 100000 || lastBar - firstBar >= 5000)) ||
      video.page < 1) {
    throw new Error('请填写有效的起止小节（最多 5000 个）')
  }
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error('视频时长尚未加载')
  }
  if (!config.segments.length) throw new Error('请先配置拍号段')
  let time = config.segments[0].firstBeatTime ?? 0
  if (!Number.isFinite(time) || time < 0) throw new Error('第一拍时间无效')
  // The editor keeps insertion order; playback sorts by the effective bar.
  // Validate before sorting so malformed positions cannot affect the ordering.
  const orderedSegments = config.segments.map((segment, i) => {
    const startBar = i === 0 ? 1 : segment.startBar!
    if (!Number.isInteger(startBar) || startBar < 1 ||
        !Number.isFinite(segment.bpm) || segment.bpm <= 0 ||
        !Number.isInteger(segment.numerator) || segment.numerator < 1 ||
        ![2, 4, 8, 16].includes(segment.denominator)) {
      throw new Error(`第 ${i + 1} 个拍号段无效：生效小节须为正整数，BPM 须为正数，拍号须有效`)
    }
    return { ...segment, startBar, editorIndex: i + 1 }
  }).sort((a, b) => a.startBar - b.startBar)
  const segments = orderedSegments.map((segment, i) => {
    const { startBar } = segment
    if (i > 0) {
      const previous = orderedSegments[i - 1]
      if (startBar === previous.startBar) {
        throw new Error(`第 ${previous.editorIndex}、${segment.editorIndex} 个拍号段都从第 ${startBar} 小节生效，请修正重复的生效小节`)
      }
      time += (startBar - previous.startBar) * previous.numerator * 60 / previous.bpm * 4 / previous.denominator
    }
    return { ...segment, startBar, startTime: time }
  })
  const bars = []
  for (let n = firstBar; lastBar === undefined || n <= lastBar; n++) {
    const seg = [...segments].reverse().find(s => s.startBar <= n)!
    const duration = seg.numerator * 60 / seg.bpm * 4 / seg.denominator
    const start = seg.startTime + (n - seg.startBar) * duration
    const end = start + duration
    // Only tolerate floating-point arithmetic noise, never include a partial final bar.
    const tolerance = Number.EPSILON * Math.max(1, end, video.duration) * 16
    if (end > video.duration + tolerance) {
      if (lastBar === undefined) break
      throw new Error(`第 ${n} 小节超出视频时长，请调整结束小节或拍号段`)
    }
    if (bars.length >= 5000 || n > 100000) throw new Error('完整小节超过交接协议的 5000 个上限，无法导出完整任务')
    bars.push({ id: `bar-${n}`, order: bars.length + 1, number: n,
      start: Math.round(start * 1e6) / 1e6, end: Math.round(end * 1e6) / 1e6,
      timeSignature: [seg.numerator, seg.denominator], quarterBpm: seg.bpm })
  }
  if (!bars.length) throw new Error('从第一拍到视频结束不足一个完整小节，请检查第一拍时间和拍号段')
  return {
    schema: 'bili-tab-capture/barlist', version: 1,
    taskId: `${video.bvid}-${video.cid}-${firstBar}-${bars[bars.length - 1].number}`, revision: 1,
    video: { bvid: video.bvid, cid: video.cid, page: video.page, title: video.title },
    bars,
  }
}

export const createHandoffUrl = (address: string, task: ReturnType<typeof createBarlistTask>) => {
  const url = new URL(address)
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('请填写本机 BiliTabCapture 地址，例如 http://127.0.0.1:5000')
  }
  url.pathname = '/'
  url.search = ''
  const bytes = new TextEncoder().encode(JSON.stringify(task))
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (encoded.length > 60000) throw new Error('任务较大，请使用「导出任务 JSON」交接')
  url.hash = `barlist=${encoded}`
  return url.toString()
}
