import { describe, expect, it } from 'vitest'
import { applyPending, rollToDate, vnToday, type LiveBoard, type LiveOp } from './queue'

const board: LiveBoard = {
  class: { id: 'c1', name: 'CLB Golf', school: null },
  date: '2026-11-27',
  session: null,
  next_session_no: 10,
  last_topic: 'Putting',
  students: [
    {
      id: 's1', full_name: 'Nguyễn An', student_code: 'VNC-000001', claim_code: 'ABC', claimed: false, date_of_birth: null,
      avatar_url: null, today: 2, total: 120, available: 80, opening: 100, has_opening: true,
      attendance: null, leave_count: 0, comment_tags: [], note: null,
    },
    {
      id: 's2', full_name: 'Trần Bình', student_code: 'VNC-000002', claim_code: 'DEF', claimed: true, date_of_birth: null,
      avatar_url: null, today: 0, total: 0, available: 0, opening: 0, has_opening: false,
      attendance: 'present', leave_count: 1, comment_tags: ['focused'], note: 'x',
    },
  ],
}

const pts = (id: string, student_id: string, delta: number, extra: Partial<LiveOp> = {}): LiveOp =>
  ({ op: 'points', id, class_id: 'c1', date: '2026-11-27', student_id, delta, tag: null, ...extra }) as LiveOp

describe('applyPending', () => {
  it('cộng điểm chưa gửi vào hôm nay, tổng và điểm đổi quà', () => {
    const v = applyPending(board, [pts('a', 's1', 3), pts('b', 's1', -1), pts('c', 's2', 2)])
    expect(v.students[0]).toMatchObject({ today: 4, total: 122, available: 82 })
    expect(v.students[1]).toMatchObject({ today: 2, total: 2, available: 2 })
    expect(board.students[0].today).toBe(2) // không đổi bảng gốc
  })

  it('sửa nhầm không kéo điểm hôm nay dưới 0 (như máy chủ)', () => {
    const v = applyPending(board, [pts('a', 's2', -1), pts('b', 's2', 1), pts('c', 's2', -1), pts('d', 's2', -1)])
    expect(v.students[1].today).toBe(0)
  })

  it('bỏ qua thao tác của lớp khác hoặc ngày khác', () => {
    const v = applyPending(board, [pts('a', 's1', 3, { class_id: 'c2' }), pts('b', 's1', 3, { date: '2026-11-26' })])
    expect(v).toBe(board)
  })

  it('điểm danh, nhận xét, chủ đề: chỉ đổi khoá có gửi', () => {
    const v = applyPending(board, [
      { op: 'mark', id: 'm1', class_id: 'c1', date: '2026-11-27', student_id: 's2', attendance: 'late' },
      { op: 'mark', id: 'm2', class_id: 'c1', date: '2026-11-27', student_id: 's2', comment_tags: ['fair_play'] },
      { op: 'topic', id: 't1', class_id: 'c1', date: '2026-11-27', topic: 'Pitching + Luật golf' },
    ])
    expect(v.students[1]).toMatchObject({ attendance: 'late', leave_count: 1, comment_tags: ['fair_play'], note: 'x' })
    expect(v.session).toMatchObject({ session_no: 10, topic: 'Pitching + Luật golf' })
  })
})

describe('rollToDate', () => {
  it('bảng điểm hôm trước: điểm hôm nay về 0, giữ tổng', () => {
    const v = rollToDate({ ...board, session: { id: 'x', session_no: 10, topic: 'Chipping' } }, '2026-11-28')
    expect(v.students[0]).toMatchObject({ today: 0, total: 120, attendance: null })
    expect(v).toMatchObject({ session: null, next_session_no: 11, last_topic: 'Chipping' })
  })
})

describe('vnToday', () => {
  it('tính theo giờ Việt Nam', () => {
    expect(vnToday(new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-28')
    expect(vnToday(new Date('2026-11-27T16:59:00Z'))).toBe('2026-11-27')
  })
})
