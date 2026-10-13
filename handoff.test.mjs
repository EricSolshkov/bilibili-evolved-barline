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

test('4–7 strings are preserved without guessing tuning', () => {
  for (const n of [4, 5, 6, 7]) {
    const task = createBarlistTask(config, video, 1, 2, n)
    assert.equal(task.instrument.stringCount, n)
    assert.equal(task.instrument.tuningMidi, null)
  }
  assert.throws(() => createBarlistTask(config, video, 1, 2, 8))
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
