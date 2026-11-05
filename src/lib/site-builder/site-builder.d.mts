// Khai báo kiểu tối thiểu cho bộ tạo trang dùng chung (mã gốc JavaScript ở app CSR).
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SiteModel {
  name: string
  slug: string
  places: any[]
  holes: any[]
  heroP: any
  [k: string]: any
}
export type ImgFn = (photo: any, model?: SiteModel) => string
export function sgModel(pack: any, opts?: { preview?: boolean; [k: string]: any }): SiteModel
export function sgCourseHTML(model: SiteModel, img: ImgFn, opts?: { home?: string; [k: string]: any }): string
export function sgIndexHTML(list: SiteModel[], img: ImgFn, opts?: Record<string, any>): string
export function sgSlug(s: string): string
export function sgPolicyPages(opts?: Record<string, any>): Record<string, string>
export function sg404HTML(opts?: Record<string, any>): string
export function sgFreshScript(...args: any[]): string
export const SG: { CAT: Record<string, [string, string]>; TABS: string[][]; [k: string]: any }
