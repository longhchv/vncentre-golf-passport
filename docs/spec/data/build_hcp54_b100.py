"""Sinh giáo án Có Handicap (8 tuần) và Break 100 (12 tuần) theo định dạng break-90-80-70.json.

Mỗi tuần một buổi chung (d = 0), tập lặp lại 3 ngày như Break 90. Dòng: p đoạn văn, o mục tiêu, h tiêu đề, b dòng bài tập.
Chỉ tiêu là chỉ tiêu tạm (spec 25), chỉnh sau trong admin.
Chạy: python3 docs/spec/data/build_hcp54_b100.py  → docs/spec/data/hcp54-b100.json
"""
import json
import os

WARM = ["p", "Khởi động 10 phút trước khi tập: xoay vai, xoay hông, giãn đùi sau, 10 lần swing nhẹ không bóng."]


def blk(area, title, minutes, items):
    return {"a": area, "h": title, "m": minutes, "it": items}


# ------------------------------------------------------------------ Có Handicap (8 tuần × 75 phút)
RULES = {
    1: "An toàn: đứng sau và chéo người đang đánh, không đứng trước mặt; chỉ swing khi xung quanh trống; thứ tự đánh: người xa lỗ đánh trước.",
    2: "Chăm sóc sân: sửa vết bóng rơi trên green, lấp hoặc đặt lại divot, cào bunker sau khi đánh.",
    3: "Bóng ngoài biên (OB) và bóng mất: phạt 1 gậy và đánh lại từ chỗ cũ. Không chắc tìm được bóng thì đánh bóng tạm trước khi đi tìm.",
    4: "Vùng phạt (cọc đỏ, cọc vàng) và bóng không đánh được: các cách xử lý, phạt 1 gậy.",
    5: "Nhịp chơi: 9 hố trong tối đa 2 giờ 15 phút. Đến par + 5 mà chưa vào lỗ thì nhặt bóng, ghi par + 5 và đi tiếp.",
    6: "Ghi điểm: mỗi vòng có người ghi điểm cùng chơi, hai bên ký phiếu; ghi đúng số gậy mỗi hố kể cả gậy phạt.",
    7: "Handicap là gì: chỉ số cho biết trình độ, giúp người chơi khác trình độ thi đấu công bằng. Muốn có chỉ số phải nộp đủ số hố tối thiểu trong app Handicap.",
    8: "Bài kiểm tra luật 20 câu: cần đúng từ 16 câu. Sau đó nộp điểm các vòng vào app Handicap (cùng mã VNC).",
}

H54 = {
    1: dict(
        putt=["Cầm gậy putt và tư thế", ["Đặt gậy sắt dưới đất làm đường thẳng, 5 phút putt dọc theo gậy (không cần lỗ)", "Vào 15 bóng từ 2 ft", "Vào 15 bóng từ 3 ft"]],
        chip=["Chip từ mép green", ["20 chip từ mép green bằng gậy sắt 9, đếm số bóng lên green", "10 chip nhắm khu vực 3 bước trước lỗ"]],
        fir=["Swing nửa không bóng", ["20 lần swing nửa không bóng với gậy sắt 7, giữ thăng bằng khi kết thúc", "10 bóng swing nửa với gậy sắt 7, bóng đặt trên tee"]],
    ),
    2: dict(
        putt=["Putt ngắn và đều tay", ["5 phút putt dọc theo gậy sắt đặt dưới đất", "Vào 20 bóng từ 3 ft", "10 putt từ 10 ft, đếm số bóng dừng trong 3 ft"]],
        chip=["Chip lên green", ["20 chip từ mép green tới lỗ gần (10 ft), đếm số bóng lên green", "20 chip tới lỗ xa (25 ft), đếm số bóng lên green"]],
        fir=["Sắt 7 swing nửa có bóng", ["15 lần swing nửa không bóng với sắt 7", "20 bóng swing nửa với sắt 7, bóng đặt trên tee; đếm số bóng bay lên, không top, không chunk"]],
    ),
    3: dict(
        putt=["Putt ngắn và putt xa", ["Vào 20 bóng từ 3 ft", "10 putt từ 15 ft, đếm số bóng dừng trong 6 ft"]],
        chip=["Pitch 20–50 yd", ["10 pitch tới mục tiêu 20 yd bằng wedge", "10 pitch tới mục tiêu 30 yd, đếm số bóng rơi vào vùng rộng như green", "10 pitch tới mục tiêu 50 yd"]],
        fir=["Swing 3/4", ["15 lần swing 3/4 không bóng với sắt 7", "20 bóng swing 3/4 với sắt 7, bóng đặt trên tee, đếm số bóng bay lên"]],
    ),
    4: dict(
        putt=["Putt xa", ["Vào 20 bóng từ 3 ft", "10 putt từ 15 ft và 10 putt từ 20 ft, đếm số bóng dừng trong 6 ft"]],
        chip=["Chip và pitch xen kẽ", ["10 chip từ mép green, đếm số bóng lên green", "10 pitch tới mục tiêu 30 yd, đếm số bóng lên green"]],
        fir=["Phát bóng bằng gậy dễ nhất", ["Chọn gậy phát bóng dễ nhất (hybrid hoặc sắt 5–7)", "20 bóng phát bóng, đếm số bóng vào hành lang rộng 40 yd", "10 bóng sắt 7 swing 3/4"]],
    ),
    5: dict(
        putt=["Chuẩn bị ra sân", ["Vào 10 bóng từ 3 ft liên tiếp", "10 putt từ 20 ft, đếm số bóng dừng trong 6 ft"]],
        chip=["Chip trước vòng", ["10 chip từ mép green, đếm số bóng lên green"]],
        fir=["Phát bóng trước khi ra sân", ["10 bóng sắt 7 swing 3/4", "15 bóng phát bóng, đếm số bóng vào hành lang rộng 40 yd"]],
    ),
    6: dict(
        putt=["Putt xa trong 6 ft", ["10 putt từ 20 ft và 10 putt từ 25 ft, đếm số bóng dừng trong 6 ft", "Vào 20 bóng từ 3 ft"]],
        chip=["Bunker cơ bản (nếu sân tập có)", ["10 cú ra bunker: mở mặt gậy, đánh vào cát sau bóng 2 inch; đếm số bóng ra khỏi bunker", "10 chip từ cỏ dày cách green 5 yd, đếm số bóng lên green"]],
        fir=["Sắt 7 swing đầy đủ", ["10 lần swing đầy đủ không bóng", "20 bóng sắt 7 swing đầy đủ, đếm số bóng bay lên", "10 bóng phát bóng, đếm số bóng vào hành lang 40 yd"]],
    ),
    7: dict(
        putt=["Thói quen trước mỗi cú putt", ["Đi quanh, chọn đường, 2 lần swing tập, rồi putt", "Vào 10 bóng từ 3 ft liên tiếp", "10 putt từ 20 ft, đếm số bóng dừng trong 6 ft"]],
        chip=["Thói quen trước mỗi cú chip", ["Chọn điểm rơi trước khi đánh", "20 chip từ mép green, đếm số bóng lên green"]],
        fir=["Thói quen trước mỗi cú phát bóng", ["Đứng sau bóng chọn mục tiêu, 1 lần swing tập, rồi đánh", "20 bóng phát bóng, đếm số bóng vào hành lang rộng 40 yd"]],
    ),
    8: dict(
        putt=["Bài kiểm tra kết thúc: putt", ["Putt ngắn: vào 7/10 từ 3 ft", "Putt xa: 5/10 từ 20 ft dừng trong 6 ft"]],
        chip=["Bài kiểm tra kết thúc: chip và pitch", ["Chip: 8/10 từ mép green lên green", "Pitch: 5/10 từ 30 yd lên green"]],
        fir=["Bài kiểm tra kết thúc: sắt 7 và phát bóng", ["Sắt 7: 7/10 bóng bay lên, không top, không chunk", "Phát bóng: 6/10 vào hành lang rộng 40 yd", "Chơi vòng ghi điểm đầu tiên có người ghi điểm và nộp vào app Handicap"]],
    ),
}

MIN54 = {"putt": 25, "chip": 20, "fir": 25}
ON_COURSE = {
    5: "Ra sân lần 1 trong tuần này (thay một buổi tập): chơi 9 hố hoặc sân ngắn cùng người hướng dẫn hoặc bạn chơi; ghi phiếu rút gọn số gậy, số putt, gậy phạt mỗi hố; đến par + 5 thì nhặt bóng.",
    7: "Ra sân lần 2 và 3 trong tuần này (thay hai buổi tập): chơi 9 hố, ghi phiếu đủ; tính giờ, không quá 2 giờ 15 phút cho 9 hố.",
}


def hcp54():
    out = []
    for w in range(1, 9):
        wk = H54[w]
        on_course = w in (5, 7)
        s = []
        for i, area in enumerate(["putt", "chip", "fir"]):
            title, lines = wk[area]
            items = [WARM] if i == 0 else []
            items += [["b", x] for x in lines]
            if area == "fir":
                items.append(["p", "Luật và phép lịch sự tuần này: " + RULES[w]])
            minutes = MIN54[area]
            if area == "fir" and on_course:
                items.append(["p", ON_COURSE[w]])
            s.append(blk(area, title, minutes, items))
        out.append({"w": w, "d": 0, "s": s})
    return out


# ------------------------------------------------------------------ Break 100 (12 tuần × khoảng 120 phút)
FIR_CLUB = {1: "sắt 7", 2: "sắt 6", 3: "hybrid", 4: "gậy phát bóng"}


def b100_week(w):
    phase = 1 if w <= 4 else 2 if w <= 8 else 3
    club = FIR_CLUB.get(w, "gậy phát bóng")
    s = []
    # Phát bóng
    if phase == 1:
        fir = [["p", f"Mô phỏng sân: tiếp xúc chắc với {club}, swing có kiểm soát"],
               ["b", f"10 lần swing nửa không bóng với {club}, đường swing từ trong ra ngoài"],
               ["b", f"10 bóng swing nửa với {club}, bóng đặt trên tee"],
               ["b", f"10 lần swing 3/4 không bóng, rồi 10 bóng swing 3/4 với {club}"],
               ["b", "10 bóng swing đầy đủ với gậy phát bóng, đếm số bóng vào hành lang rộng 40 yd"]]
    elif phase == 2:
        fir = [["p", "Gate drill: cắm 2 tee hai bên đầu gậy, rộng hơn đầu gậy 1 cm, để bóng trúng giữa mặt gậy"],
               ["b", "20 bóng sắt 7 qua gate drill, đếm số lần không chạm tee"],
               ["b", "20 bóng gậy phát bóng, đếm số bóng vào hành lang rộng 40 yd"]]
    else:
        fir = [["p", "Mô phỏng 18 hố trên sân tập: mỗi hố chọn gậy phát bóng như trên sân thật"],
               ["b", "14 cú phát bóng (14 hố par 4 và par 5), đếm số bóng vào hành lang rộng 40 yd"],
               ["b", "Chơi 2 bóng, lấy bóng tệ hơn: 6 cặp phát bóng"]]
    s.append(blk("fir", "Phát bóng", 25, [WARM] + fir))
    # Tiếp cận green
    if phase == 1:
        gir = [["b", "10 lần swing nửa và 10 lần swing đầy đủ không bóng với wedge"],
               ["b", "Đánh 5 bóng tới mục tiêu 30 yd, ghi số bóng vào green tưởng tượng rộng 20 yd"],
               ["b", "Đánh 5 bóng tới mục tiêu 50 yd, ghi số bóng vào green"],
               ["b", "Đánh 10 bóng tới mục tiêu 75 yd, ghi số bóng vào green"]]
    elif phase == 2:
        gir = [["b", "Đánh 5 bóng tới 50 yd, 10 bóng tới 75 yd, 10 bóng tới 100 yd; ghi số bóng vào green rộng 20 yd"],
               ["b", "Trajectory: 5 bóng sắt 7 đánh thấp, 5 bóng đánh cao tới cùng mục tiêu"]]
    else:
        gir = [["b", "Green Assault: 18 cú tiếp cận, mỗi cú đổi khoảng cách 30–120 yd ngẫu nhiên, ghi số bóng vào green"],
               ["b", "Ghi lại khoảng cách gậy (carry) của wedge, sắt 9, sắt 7 vào mục Khoảng cách gậy"]]
    s.append(blk("gir", "Tiếp cận green", 20, gir))
    # Cứu điểm
    if phase == 1:
        scr = [["p", "Một bóng duy nhất. Lượt thành công khi bóng lên green và vào lỗ trong tối đa 2 putt"],
               ["b", "10 lượt từ mép green tới lỗ gần (10–15 ft)"], ["b", "5 lượt tới lỗ xa (25–30 ft)"]]
    elif phase == 2:
        scr = [["b", "10 lượt từ cỏ dày cách green 5 yd: lên green và vào lỗ trong tối đa 2 putt"],
               ["b", "5 lượt chip rồi 1 putt (up & down thật), đếm số lần thành công"]]
    else:
        scr = [["p", "Áp lực: mỗi lượt coi như cần cứu bogey ở hố cuối"],
               ["b", "10 lượt từ vị trí ngẫu nhiên (mép green, cỏ dày, bunker nếu có), đếm số lần lên green và tối đa 2 putt"]]
    s.append(blk("scr", "Cứu điểm quanh green", 20, scr))
    # Chip
    if phase == 1:
        chip = [["p", "Tạo vòng tròn 6 ft quanh lỗ bằng tee hoặc mác bóng"],
                ["b", "20 chip tới lỗ xa (40 ft), đếm số bóng dừng trong 6 ft"],
                ["b", "20 chip tới lỗ vừa (25 ft), đếm số bóng dừng trong 6 ft"],
                ["b", "20 chip tới lỗ gần (10–15 ft), đếm số bóng dừng trong 6 ft"],
                ["b", "20 chip xen kẽ 3 lỗ, đếm số bóng dừng trong 6 ft"]]
    elif phase == 2:
        chip = [["p", "Kiểm soát khoảng cách: đặt khăn 1 ft × 1 ft làm điểm rơi"],
                ["b", "20 chip từ mép green rơi vào khăn đặt 5 ft trên green"],
                ["b", "20 chip rơi vào khăn đặt 10 ft trên green"],
                ["b", "20 bump & run bằng sắt 7 tới lỗ xa, đếm số bóng dừng trong 6 ft"]]
    else:
        chip = [["b", "Points chipping: 20 chip, trong 3 ft được 2 điểm, trong 6 ft được 1 điểm; ghi tổng điểm"],
                ["b", "Chip áp lực: dừng trong 6 ft 10 lần liên tiếp ở lỗ vừa"],
                ["b", "20 chip xen kẽ lỗ gần, vừa, xa"]]
    s.append(blk("chip", "Chip", 25, chip))
    # Putt
    if phase == 1:
        putt = [["b", "5 phút putt dọc theo gậy sắt đặt dưới đất"],
                ["b", "Vào 20 bóng từ 2 ft và 20 bóng từ 3 ft"],
                ["b", "20 putt từ 15 ft, đếm số bóng dừng trong 3 ft"],
                ["b", "20 putt từ 20 ft, đếm số bóng dừng trong 3 ft"],
                ["b", "20 putt từ 25 ft, đếm số bóng dừng trong 3 ft"]]
    elif phase == 2:
        putt = [["b", "Vào 20 bóng từ 3 ft và 20 bóng từ 4 ft"],
                ["b", "20 putt từ 20 ft, đếm số bóng dừng trong 3 ft"],
                ["b", "20 putt từ 25 ft, đếm số bóng dừng trong 3 ft"],
                ["b", "20 putt từ 30 ft, đếm số bóng dừng trong 3 ft"]]
    else:
        putt = [["b", "Circle drill: 5 tee quanh lỗ cách 3 ft, vào cả 5 liên tiếp; làm 3 vòng"],
                ["b", "Vào 10 bóng từ 3 ft liên tiếp"],
                ["b", "18 putt xa ngẫu nhiên 15–35 ft, mỗi lượt tối đa 2 putt; đếm số lần 3 putt"]]
    if w % 2 == 0:
        putt.append(["p", "Tuần này nên ra sân 9 hố một lần và ghi phiếu đủ: số gậy, số putt, gậy phạt và mất bóng, số hố lên green trước 1 gậy."])
    s.append(blk("putt", "Putt", 30, putt))
    return {"w": w, "d": 0, "s": s}


def b100():
    return [b100_week(w) for w in range(1, 13)]


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    data = {"hcp54": hcp54(), "b100": b100()}
    with open(os.path.join(here, "hcp54-b100.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    for k, v in data.items():
        print(k, len(v), "buổi,", sum(len(x["s"]) for x in v), "phần,", [sum(b["m"] for b in x["s"]) for x in v])
