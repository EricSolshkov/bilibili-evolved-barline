import assert from 'node:assert/strict'
import test from 'node:test'
import { createBarlistTask, createHandoffUrl } from './handoff.ts'
import { barStartTime } from './config.ts'

const video = { bvid: 'BV1iR2iB5Ejk', cid: '12345', page: 2, title: '测试 中文', duration: 120 }
const config = { segments: [
  { firstBeatTime: 1.25, bpm: 120, numerator: 4, denominator: 4 },
  { startBar: 3, bpm: 90, numerator: 6, denominator: 8 },
], metronomeMuted: true, metronomeVolume: 1 }

test('timeline agrees with existing barline, including tempo and 6/8 changes', () => {
  const task = createBarlistTask(config, video, 2, 5, 4)
  assert.deepEqual(task.bars.map(b => b.number), [2, 3, 4, 5])
  for (const bar of task.bars) {
    assert.equal(bar.start, barStartTime(config, bar.number))
    assert.equal(bar.end, barStartTime(config, bar.number + 1))
  }
})

test('barlist contains timing only, without notation settings', () => {
  const task = createBarlistTask(config, video)
  assert.equal('instrument' in task, false)
  assert.equal('stringCount' in task, false)
})

test('handoff URL roundtrips Unicode and all bar data; keeps data out of query', () => {
  const task = createBarlistTask(config, video, 1, 5, 7)
  const url = new URL(createHandoffUrl('http://127.0.0.1:5003/', task))
  assert.equal(url.port, '5003')
  assert.equal(url.search, '')
  assert.deepEqual(JSON.parse(Buffer.from(url.hash.slice('#barlist='.length), 'base64url').toString()), task)
  assert.throws(() => createHandoffUrl('https://example.com', task))
})

test('invalid ranges, unavailable identity, duplicate segments and overlong links fail clearly', () => {
  assert.throws(() => createBarlistTask(config, video, 2, 1, 6))
  assert.throws(() => createBarlistTask(config, video, 1, 100, 6))
  assert.throws(() => createBarlistTask(config, { ...video, cid: '' }, 1, 2, 6))
  assert.throws(() => createBarlistTask({ ...config, segments: [config.segments[0], { ...config.segments[1], startBar: 1 }] }, video, 1, 2, 6))
  const large = createBarlistTask(config, { ...video, duration: 86400 }, 1, 1000, 6)
  assert.throws(() => createHandoffUrl('http://localhost:5000', large), /JSON/)
})

test('automatic export extends all tempo and meter segments to the last complete bar', () => {
  const changed = { ...config, segments: [
    config.segments[0],
    { startBar: 3, bpm: 60, numerator: 3, denominator: 4 },
    { startBar: 5, bpm: 120, numerator: 6, denominator: 8 },
  ] }
  const task = createBarlistTask(changed, { ...video, duration: 15 })
  assert.deepEqual(task.bars.map(b => b.number), [1, 2, 3, 4, 5, 6])
  assert.equal(task.bars.at(-1).end, 14.25)
  assert.equal(task.taskId, `${video.bvid}-${video.cid}-1-6`)
  for (const bar of task.bars) {
    assert.equal(bar.start, barStartTime(changed, bar.number))
    assert.equal(bar.end, barStartTime(changed, bar.number + 1))
  }
})

test('out-of-order meter changes export the playback timeline without reordering the project', () => {
  const changed = { ...config, segments: [
    config.segments[0],
    { startBar: 7, bpm: 120, numerator: 5, denominator: 8 },
    { startBar: 3, bpm: 60, numerator: 3, denominator: 4 },
    { startBar: 5, bpm: 120, numerator: 6, denominator: 8 },
  ] }
  const original = structuredClone(changed)
  const clip = { ...video, duration: 18.5 }
  const sorted = { ...changed, segments: [changed.segments[0], ...changed.segments.slice(1).sort((a, b) => a.startBar - b.startBar)] }
  const task = createBarlistTask(changed, clip)
  assert.deepEqual(task, createBarlistTask(sorted, clip))
  assert.deepEqual(task.bars.map(b => b.timeSignature), [[4, 4], [4, 4], [3, 4], [3, 4], [6, 8], [6, 8], [5, 8], [5, 8], [5, 8]])
  for (const bar of task.bars) {
    assert.equal(bar.start, barStartTime(changed, bar.number))
    assert.equal(bar.end, barStartTime(changed, bar.number + 1))
  }
  assert.deepEqual(createBarlistTask(changed, clip, 4, 8).bars.map(b => b.number), [4, 5, 6, 7, 8])
  assert.deepEqual(changed, original)
})

test('sorting meter changes still rejects duplicate bars and invalid segment fields', () => {
  for (const invalid of [
    { startBar: 3 }, { startBar: 1 }, { startBar: 0 }, { startBar: 2.5 },
    { startBar: undefined }, { startBar: NaN }, { startBar: Infinity },
    { bpm: 0 }, { bpm: NaN }, { bpm: Infinity },
    { numerator: 0 }, { numerator: 1.5 }, { denominator: 3 },
  ]) {
    const changed = { ...config, segments: [
      config.segments[0],
      { ...config.segments[1], startBar: 5, ...invalid },
      config.segments[1],
    ] }
    assert.throws(() => createBarlistTask(changed, video), /拍号段/)
  }
})

test('BV1rERMYNEJo reports the two conflicting meter rows at bar 12', () => {
  const project = { ...config, segments: [
    { firstBeatTime: 4.6, bpm: 126, numerator: 7, denominator: 4 },
    ...[
      [4, 8, 4], [5, 7, 4], [12, 8, 4], [12, 4, 4],
      [52, 7, 8], [53, 5, 8], [54, 7, 8], [55, 5, 8], [56, 4, 4],
      [57, 7, 8], [58, 5, 8], [59, 7, 8], [60, 5, 8], [61, 4, 4],
      [188, 7, 4], [202, 4, 4],
    ].map(([startBar, numerator, denominator]) => ({ startBar, numerator, denominator, bpm: 126 })),
  ] }
  assert.throws(
    () => createBarlistTask(project, { ...video, bvid: 'BV1rERMYNEJo', cid: '28728819866' }),
    /第 4、5 个拍号段都从第 12 小节生效/,
  )
})

test('automatic export includes exact endings, excludes partial bars and handles floating point', () => {
  const cfg = { ...config, segments: [{ firstBeatTime: 0.177, bpm: 150, numerator: 4, denominator: 4 }] }
  for (const duration of [185.9, 185.777, 185.7769]) {
    const task = createBarlistTask(cfg, { ...video, duration })
    assert.equal(task.bars.length, duration < 185.777 ? 115 : 116)
    assert.ok(task.bars.at(-1).end <= duration)
  }
  assert.throws(() => createBarlistTask(cfg, { ...video, duration: 1 }), /完整小节/)
  assert.throws(() => createBarlistTask(cfg, { ...video, duration: Infinity }), /时长/)
  assert.throws(() => createBarlistTask(cfg, { ...video, duration: NaN }), /时长/)
  assert.equal(createBarlistTask(cfg, { ...video, duration: 8000.177 }).bars.length, 5000)
  assert.throws(() => createBarlistTask(cfg, { ...video, duration: 8001.777 }), /5000/)
})
