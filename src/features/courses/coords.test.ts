import { describe, expect, it } from 'vitest'
import { distanceKm, parseLatLng } from './coords'

describe('đọc toạ độ từ link Google Maps', () => {
  it('ưu tiên toạ độ địa điểm !3d!4d', () => {
    const link = 'https://www.google.com/maps/place/C%E1%BB%ADa+L%C3%B2+Golf/@18.78,105.73,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d18.783065!4d105.737451'
    expect(parseLatLng(link)).toEqual({ lat: 18.783065, lng: 105.737451 })
  })
  it('đọc tâm bản đồ @lat,lng', () => {
    expect(parseLatLng('https://www.google.com/maps/@12.5703,99.9512,14z')).toEqual({ lat: 12.5703, lng: 99.9512 })
  })
  it('đọc ?q=lat,lng và chuỗi gõ tay', () => {
    expect(parseLatLng('https://maps.google.com/?q=18.62833,105.809989')).toEqual({ lat: 18.62833, lng: 105.809989 })
    expect(parseLatLng(' 18.62833, 105.809989 ')).toEqual({ lat: 18.62833, lng: 105.809989 })
  })
  it('trả null khi không có toạ độ hoặc sai phạm vi', () => {
    expect(parseLatLng('https://maps.app.goo.gl/abc123')).toBeNull()
    expect(parseLatLng('95, 200')).toBeNull()
    expect(parseLatLng('')).toBeNull()
  })
})

describe('khoảng cách', () => {
  it('Xuân Thành → Cửa Lò khoảng 19 km đường chim bay', () => {
    expect(distanceKm({ lat: 18.62833, lng: 105.809989 }, { lat: 18.783065, lng: 105.737451 })).toBeCloseTo(18.8, 0)
  })
})
