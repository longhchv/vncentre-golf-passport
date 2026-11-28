// Lớp học trực tiếp: hàng đợi thao tác trên máy HLV (mạng yếu vẫn chấm được) và cách cộng các thao tác
// chưa gửi vào bảng điểm đang hiện. Máy chủ nhận lại nhiều lần vẫn chỉ ghi một lần (class_live_sync).

export type PointTag = 'game' | 'rules' | 'listen' | 'fair_play' | 'team_win'
/** Lý do khi trừ: sửa nhầm (hoàn tác) hoặc trừ điểm (phạt) */
export type MinusTag = 'fix' | 'penalty'
export type CommentTag = 'focused' | 'needs_reminder' | 'tech_progress' | 'fair_play'
export type Attendance = 'present' | 'late' | 'absent'

export const POINT_TAGS: PointTag[] = ['game', 'rules', 'listen', 'fair_play', 'team_win']
export const COMMENT_TAGS: CommentTag[] = ['focused', 'needs_reminder', 'tech_progress', 'fair_play']

export type LiveOp =
  | { op: 'points'; id: string; class_id: string; date: string; student_id: string; delta: number; tag?: PointTag | MinusTag | null }
  | {
      op: 'mark'
      id: string
      class_id: string
      date: string
      student_id: string
      attendance?: Attendance | null
      leave_count?: number
      comment_tags?: CommentTag[]
      note?: string | null
      team?: 'A' | 'B' | null
    }
  | { op: 'topic'; id: string; class_id: string; date: string; session_no?: number | null; topic?: string | null }

export interface LiveStudent {
  id: string
  full_name: string
  student_code: string
  claim_code: string | null
  claimed: boolean
  date_of_birth: string | null
  avatar_url: string | null
  today: number
  total: number
  available: number
  opening: number
  has_opening: boolean
  attendance: Attendance | null
  leave_count: number
  comment_tags: CommentTag[]
  note: string | null
  /** Đội trong buổi (trình chiếu theo đội) */
  team?: 'A' | 'B' | null
}

export interface LiveBoard {
  class: { id: string; name: string; school: string | null }
  date: string
  /** Các mức điểm HLV bấm (cài đặt class_live.point_steps) */
  steps?: number[]
  /** Điểm có mặt và trần điểm mỗi buổi của loại lớp (CLB / trường công lập) */
  /** Giáo án: phần tử thứ N là chủ đề Buổi N */
  topics?: string[]
  rules?: { kind: 'club' | 'public_school'; attendance_points: number; session_cap: number }
  session: { id: string; session_no: number | null; topic: string | null; summary_sent_at?: string | null } | null
  next_session_no: number
  last_topic: string | null
  students: LiveStudent[]
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (máy chủ cũng tính buổi học theo giờ Việt Nam). */
export function vnToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now)
}

/** Cộng các thao tác chưa gửi (của đúng lớp, đúng ngày) vào bảng điểm lấy từ máy chủ. */
const attending = (a: Attendance | null) => a === 'present' || a === 'late'

/** Số điểm còn được cộng trong buổi cho một bạn (trần tính cả điểm danh). */
export function remainingToday(board: Pick<LiveBoard, 'rules'>, s: Pick<LiveStudent, 'today'>): number {
  return board.rules ? Math.max(0, board.rules.session_cap - s.today) : Infinity
}

export function applyPending(board: LiveBoard, ops: LiveOp[]): LiveBoard {
  const mine = ops.filter((o) => o.class_id === board.class.id && o.date === board.date)
  if (mine.length === 0) return board
  const students = board.students.map((s) => ({ ...s }))
  const byId = new Map(students.map((s) => [s.id, s]))
  let session = board.session
  const add = (s: LiveStudent, d: number) => {
    s.today += d
    s.total += d
    s.available += d
  }
  for (const o of mine) {
    if (o.op === 'topic') {
      session = {
        id: session?.id ?? '',
        session_no: 'session_no' in o && o.session_no !== undefined ? o.session_no : (session?.session_no ?? board.next_session_no),
        topic: 'topic' in o && o.topic !== undefined ? o.topic : (session?.topic ?? null),
      }
      continue
    }
    const s = byId.get(o.student_id)
    if (!s) continue
    if (o.op === 'points') {
      // Giống máy chủ: hoàn tác không xuống dưới 0, cộng không vượt trần của buổi
      if (o.delta < 0 && s.today + o.delta < 0) continue
      if (o.delta > 0 && o.delta > remainingToday(board, s)) continue
      add(s, o.delta)
    } else {
      if (o.attendance !== undefined) {
        // Có mặt / vào muộn được cộng điểm danh; đổi sang vắng thì trừ lại
        const pts = board.rules?.attendance_points ?? 0
        if (attending(o.attendance) !== attending(s.attendance)) add(s, attending(o.attendance) ? pts : -pts)
        s.attendance = o.attendance
      }
      if (o.leave_count !== undefined) s.leave_count = o.leave_count
      if (o.comment_tags !== undefined) s.comment_tags = o.comment_tags
      if (o.note !== undefined) s.note = o.note
      if (o.team !== undefined) s.team = o.team
    }
  }
  return { ...board, session, students }
}

/** Bảng điểm lưu trên máy từ hôm trước: đưa về đầu buổi hôm nay (điểm hôm nay 0, chưa điểm danh). */
export function rollToDate(board: LiveBoard, date: string): LiveBoard {
  if (board.date === date) return board
  return {
    ...board,
    date,
    session: null,
    // Buổi sau = số buổi lớn nhất + 1 (như máy chủ)
    next_session_no: board.session ? (board.session.session_no ?? board.next_session_no) + 1 : board.next_session_no,
    last_topic: board.session?.topic ?? board.last_topic,
    students: board.students.map((s) => ({ ...s, today: 0, attendance: null, leave_count: 0, comment_tags: [], note: null })),
  }
}

const QUEUE_KEY = 'vnc-live-queue-v1'
const BOARD_KEY = (classId: string) => `vnc-live-board-v1:${classId}`

export function loadQueue(): LiveOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? (JSON.parse(raw) as LiveOp[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveQueue(ops: LiveOp[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops))
  } catch {
    // Bộ nhớ trình duyệt bị chặn: vẫn chấm được, chỉ mất hàng đợi nếu tải lại trang khi mất mạng
  }
}

export function loadCachedBoard(classId: string): LiveBoard | undefined {
  try {
    const raw = localStorage.getItem(BOARD_KEY(classId))
    return raw ? (JSON.parse(raw) as LiveBoard) : undefined
  } catch {
    return undefined
  }
}

export function saveCachedBoard(board: LiveBoard) {
  try {
    localStorage.setItem(BOARD_KEY(board.class.id), JSON.stringify(board))
  } catch {
    // như trên
  }
}

export function newId(): string {
  return crypto.randomUUID()
}
