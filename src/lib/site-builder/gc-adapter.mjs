// Chuyển dữ liệu khu quản trị sân (bảng gc_*) thành "pack" mà bộ tạo trang (sgModel) đang dùng.
// Dùng trong Golf Passport cho sân trải nghiệm; sân đo vẫn lấy pack từ app CSR rồi thay places bằng gc_places.
// Minh · 23/10/2026
export const yd = (len, units) => units === 'm' ? Math.round(len / 0.9144) : len;

export function placesFromGc(rows = []) {
  return rows.filter(p => !p.hidden).map(p => ({
    ...(p.data || {}), id: p.legacy_id || p.id, src: p.src, cat: p.cat, name: p.name, area: p.area,
    note: p.note, noteEn: p.note_en, phone: p.phone, km: p.km == null ? undefined : +p.km, driveMin: p.drive_min ?? undefined,
    gR: p.g_rating == null ? undefined : +p.g_rating, gN: p.g_count ?? undefined, gAt: p.g_at || undefined, pid: p.pid || undefined,
    family: !!p.family }));
}

export function packFromGc({ course, tees = [], photos = [], review = null, places = [], photoUrl = p => p.path }) {
  const c = course;
  return {
    course: { id: c.id, name: c.name, nameEn: c.name_en, province: c.province, country: c.country, holes: c.holes, kind: c.kind,
      lat: c.lat, lng: c.lng, phone: c.phone, website: c.website, playedOn: c.played_on },
    tees: tees.map(t => ({ id: t.id, title: t.name, gender: t.gender === 'F' ? 'F' : 'M', color: t.color,
      holes: (t.holes || []).map(h => ({ par: h.par, si: h.si, len: h.len == null ? null : yd(+h.len, c.units) })), photos: [] })),
    guide: {
      info: { introVi: c.intro_vi || '', introEn: c.intro_en || '', facilities: c.facilities || [], booking: c.booking || {} },
      travel: {},
      places: placesFromGc(places),
      photos: photos.map(p => ({ id: p.id, url: photoUrl(p), kind: p.kind, hole: p.hole, caption: p.caption_vi, captionEn: p.caption_en })),
      review: review ? { scores: review.scores, vi: review.text_vi, en: review.text_en, tips: review.tips, playedOn: review.played_on } : null,
    },
    officialWHS: [],
  };
}
