#!/usr/bin/env python3
"""Вырезать сплошной фон-ключ (по умолчанию магента #FF00FF) в прозрачность.

Зачем это здесь. Генератор картинок на просьбу «transparent background» почти
всегда рисует СЕРУЮ ШАХМАТКУ пикселями — она выглядит как прозрачность, но ею
не является. Снять её постобработкой нельзя: пиксель-арт этой игры сам по себе
малонасыщенный и лежит в той же вилке яркости, что и клетки, поэтому любой
ключ — хоть по цвету, хоть по яркости — режет заодно и рисунок.

Поэтому фон заказывается сплошной магентой (см. ASSET_PROMPTS.md, «Фон»), а
этот скрипт её снимает. Магента выбрана потому, что в палитре игры такого
цвета нет: ни один пиксель рисунка на неё не похож.

Что делает:
  * альфа по одному из двух допущений о рисунке (--mode, см. cut);
  * снимает «подмес» ключа с полупрозрачных краёв (spill): у ореола и
    сглаженной кромки в цвет затекает фон, и без вычитания вокруг спрайта
    остаётся розовая кайма;
  * по желанию режет лист на ровную сетку и центрирует каждый кадр по его
    содержимому — модели любят возвращать кадры разного размера и съехавшие
    в сторону, а движок делит лист на равные клетки и ждёт, что предмет в
    каждой стоит по центру.

Примеры:
    python3 tools/cut_key.py in.png docs/assets/images/ui/emblem.png
    python3 tools/cut_key.py in.png out.png --grid 4x1 --cell 256
    python3 tools/cut_key.py in.png out.png --mode pale   # если есть светлое
    python3 tools/cut_key.py in.png out.png --key 00FF00
"""
import argparse, sys
try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.exit("нужны pillow и numpy:  pip install pillow numpy")


def cut(img, key, lo, hi, mode="saturated"):
    """Альфа по цветовому ключу.

    Задача недоопределена: в пикселе p = a*F + (1-a)*key три уравнения и
    четыре неизвестных (цвет F и сама альфа). Любой кеинг добавляет к этому
    ДОПУЩЕНИЕ о том, каким бывает рисунок, и допущение приходится выбирать
    под картинку. Отсюда два режима — проверено на двух листах, и ни один не
    работает за оба:

    saturated (по умолчанию) — «рисунок насыщенный, хотя бы один канал у него
      тёмный». Тогда доля фона ограничена яркими каналами ключа: вычесть
      больше, чем в них есть, нельзя, цвет ушёл бы в минус. Это верно для
      золота, бирюзы, почти любого спрайта. Светлое СЪЕДАЕТ: бледная кремовая
      нить — это высокий красный и высокий синий, то есть по такой мерке «в
      основном фон», и нить становится полупрозрачной.

    pale — «рисунок не перекошен в сторону ключа». Меряем сам перекос: у
      магенты это превышение красного и синего над зелёным, у чистого фона
      единица, у нейтрального нуль. Спасает светлое, но на золотом ореоле
      завышает альфу: собственный перекос золота гасит часть перекоса фона,
      фона вычитается меньше нужного, и ореол розовеет.

    Правило простое: есть в картинке кремовое, белое, бледное — pale, иначе
    saturated. Чего не делать ни в каком режиме — считать альфу по расстоянию
    до ключа: оно растёт нелинейно, мягкий край получает завышенную альфу, и
    вокруг спрайта остаётся розовая кайма.
    """
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    k = np.array(key, dtype=np.float32)
    w = k - k.mean()                       # направление «в сторону ключа»
    if mode == "grey":
        # СЕРЫЙ ФОН (нарисованная шахматка). Работает ТОЛЬКО если в рисунке
        # нет своих нейтральных мест: ключом служит сама насыщенность, и всё
        # бесцветное уйдёт в прозрачность вместе с подложкой. Для кислотной
        # лужи это верно — у неё насыщенность 109..166 против 0..2 у клеток.
        # Для кроны элиты было неверно: её шипы почти серые, и их срезало.
        chroma = a.max(axis=2) - a.min(axis=2)
        alpha = np.clip((chroma - 6.0) / 42.0, 0.0, 1.0)
        # фон вычитаем как ровный серый — берём его из самой картинки
        flat = a[(chroma < 4)]
        B = float(flat.mean()) if len(flat) else 64.0
        den = np.maximum(alpha, 0.06)[..., None]
        F = np.clip((a - (1 - alpha[..., None]) * B) / den, 0, 255)
        F = np.where(alpha[..., None] > 0.98, a, F)
        return np.dstack([F.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    if mode == "pale":
        norm = float((k * w).sum() - k.mean() * w.sum())
        if abs(norm) < 1e-3:
            sys.exit("ключ нейтральный (серый) — возьмите магенту #FF00FF")
        d = ((a * w).sum(axis=2) - a.mean(axis=2) * w.sum()) / norm
    else:
        bright = k > 32
        if not bright.any():
            sys.exit("ключ слишком тёмный, возьмите магенту #FF00FF")
        d = np.min(a[..., bright] / k[bright], axis=2)
    alpha = np.clip(1.0 - d, 0.0, 1.0)
    # допуск: почти чистый фон считаем фоном, почти плотный пиксель — плотным
    alpha = np.clip((alpha - lo) / max(1e-6, 1.0 - lo - hi), 0.0, 1.0)

    den = np.maximum(alpha, 0.06)[..., None]
    F = np.clip((a - (1 - alpha[..., None]) * k) / den, 0, 255)
    F = np.where(alpha[..., None] > 0.98, a, F)

    # ПОДАВЛЕНИЕ ПОДМЕСА. Вычитание фона по формуле не идеально: на мягком
    # крае в цвете остаётся оттенок ключа, и золотой ореол уходит в розовый.
    # Гасим остаток у всего ПОЛУПРОЗРАЧНОГО и не трогаем плотное — иначе
    # пострадал бы законный цвет: в палитре игры есть грибной фиолетовый
    # #6b2d5c, он «магентовее» серого, и подавление превратило бы его в грязь.
    hi, lo_ch = w > 0, w < 0
    if hi.any() and lo_ch.any():
        ex = np.clip(F[..., hi].mean(axis=2) - F[..., lo_ch].mean(axis=2), 0, None)
        # Именно на полную, а не пропорционально (1-alpha): в режиме pale
        # альфа на ореоле выходит завышенной, и пропорциональное подавление
        # оказывается слишком слабым — розовое остаётся. Золото при этом не
        # страдает: у него перекос в другую сторону, ex выходит нулём.
        strength = np.clip((0.98 - alpha) / 0.08, 0.0, 1.0)
        F[..., hi] = np.clip(F[..., hi] - (ex * strength)[..., None], 0, 255)

    return np.dstack([F.astype(np.uint8), (alpha * 255).astype(np.uint8)])


def main_shape(sub):
    """Центр и радиус главной фигуры клетки: самой крупной плотной области."""
    try:
        from scipy import ndimage as ndi
    except ImportError:
        return None
    core = sub[..., 3] > 128
    if not core.any():
        return None
    lab, n = ndi.label(core)
    if n == 0:
        return None
    sizes = ndi.sum(core, lab, range(1, n + 1))
    ys, xs = np.where(lab == int(np.argmax(sizes)) + 1)
    return ((ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2,
            max(ys.max() - ys.min(), xs.max() - xs.min()) / 2)


def isolate(sub, keep=1.35, speck=0.04):
    """Выбросить из клетки всё, что не относится к её главному предмету.

    Модель охотно дорисовывает лишнее в промежутках между кадрами — обрывок
    шипа, клок дыма. Отсев в два приёма:

    1. ПО РАЗМЕРУ. Плотные фигуры делятся на три класса: главная (самая
       большая), мелочь (искры, брызги — меньше speck от главной) и всё
       остальное. Вот это «всё остальное» и есть чужой обрывок: слишком
       крупный, чтобы быть искрой, и не главный предмет. Расстоянием его не
       поймать — он лежит вплотную к предмету.
    2. ПО РАССТОЯНИЮ. Что осталось дальше keep радиусов от центра главной
       фигуры — тоже за борт.

    Без этого пересборка сетки считает мусор частью кадра, и предмет уезжает
    из центра ровно на столько, сколько мусор весит.
    """
    try:
        from scipy import ndimage as ndi
    except ImportError:
        return sub
    core = sub[..., 3] > 128
    if not core.any():
        return sub
    lab, n = ndi.label(core)
    if n == 0:
        return sub
    sizes = np.asarray(ndi.sum(core, lab, range(1, n + 1)))
    top = int(np.argmax(sizes))
    junk = np.zeros(n + 1, bool)
    junk[1:] = (sizes > speck * sizes[top])
    junk[top + 1] = False                       # главную фигуру не трогаем
    drop = junk[lab]
    # обрывок нарисован с ореолом, поэтому гасим и дымку вокруг него
    drop = ndi.binary_dilation(drop, np.ones((9, 9)), iterations=3)

    ys, xs = np.where(lab == top + 1)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    R = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2
    yy, xx = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
    far = ((yy - cy) ** 2 + (xx - cx) ** 2) > (R * keep) ** 2

    out = sub.copy()
    out[..., 3] = np.where(drop | far, 0, out[..., 3])
    return out


def regrid(rgba, cols, rows, cell, pad, clean=False, anchor=False):
    """Пересобрать лист в ровную сетку.

    По умолчанию кадр вписывается в клетку по всему своему содержимому.
    С --anchor масштаб и центр берутся по ГЛАВНОЙ ФИГУРЕ кадра, а ореол и
    искры просто выходят за неё и обрезаются краем клетки. Для анимации нужно
    именно это: если масштаб считать по всему содержимому, то кадр с пышными
    искрами ужмётся сильнее кадра без них — и предмет начнёт дышать в размере,
    хотя нарисован одинаковым.
    """
    H, W, _ = rgba.shape
    cw, ch = W // cols, H // rows
    out = np.zeros((rows * cell, cols * cell, 4), dtype=np.uint8)
    box = cell * (1 - 2 * pad)
    for r in range(rows):
        for c in range(cols):
            sub = rgba[r*ch:(r+1)*ch, c*cw:(c+1)*cw]
            if clean:
                sub = isolate(sub)
            ys, xs = np.where(sub[..., 3] > 8)
            if len(xs) == 0:
                continue

            shape = main_shape(sub) if anchor else None
            if shape:
                cy, cx, R = shape
                s = box / max(2 * R, 1)
            else:
                cy, cx = (ys.min()+ys.max())/2, (xs.min()+xs.max())/2
                s = min(box / max(xs.max()-xs.min()+1, 1),
                        box / max(ys.max()-ys.min()+1, 1))

            im = Image.fromarray(sub, "RGBA").resize(
                (max(1, int(sub.shape[1]*s)), max(1, int(sub.shape[0]*s))), Image.NEAREST)
            t = np.asarray(im)
            # ставим так, чтобы центр главной фигуры попал в центр клетки
            oy = int(round(cell/2 - cy*s)); ox = int(round(cell/2 - cx*s))
            sy0, sx0 = max(0, -oy), max(0, -ox)
            dy0, dx0 = max(0, oy), max(0, ox)
            h = min(t.shape[0]-sy0, cell-dy0); w = min(t.shape[1]-sx0, cell-dx0)
            if h <= 0 or w <= 0:
                continue
            out[r*cell+dy0 : r*cell+dy0+h, c*cell+dx0 : c*cell+dx0+w] = \
                t[sy0:sy0+h, sx0:sx0+w]
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src"); p.add_argument("dst")
    p.add_argument("--key", default="FF00FF", help="цвет фона в hex, по умолчанию магента")
    p.add_argument("--lo", type=float, default=0.05, help="ниже этой альфы — считаем чистым фоном")
    p.add_argument("--hi", type=float, default=0.14, help="выше 1-hi — считаем полностью непрозрачным")
    p.add_argument("--mode", choices=("saturated","pale","grey"), default="saturated",
                   help="pale — если в картинке есть кремовое, белое, бледное; "
                        "grey — фон СЕРЫЙ (нарисованная шахматка), годится только "
                        "когда в самом рисунке нет бесцветных мест")
    p.add_argument("--grid", help="пересобрать в ровную сетку, напр. 4x1 (колонки x ряды)")
    p.add_argument("--cell", type=int, default=256, help="сторона клетки на выходе")
    p.add_argument("--pad", type=float, default=0.06, help="поля вокруг содержимого клетки")
    p.add_argument("--clean", action="store_true",
                   help="выбросить из каждой клетки чужие обрывки у краёв")
    p.add_argument("--anchor", action="store_true",
                   help="масштаб и центр по главной фигуре, а не по всему содержимому:\n                        нужно для анимаций, иначе предмет дышит в размере")
    args = p.parse_args()

    key = tuple(int(args.key.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
    img = Image.open(args.src)
    rgba = cut(img, key, args.lo, args.hi, args.mode)
    a = rgba[..., 3]
    print(f"{img.size[0]}x{img.size[1]} -> прозрачно {(a<8).mean()*100:.0f}%, "
          f"полупрозрачно {(((a>=8)&(a<248)).mean()*100):.0f}%, "
          f"непрозрачно {(a>=248).mean()*100:.0f}%")
    if (a < 8).mean() < 0.02:
        print("ВНИМАНИЕ: прозрачного почти нет. Либо фон не тот цвет, либо это "
              "нарисованная шахматка — её вырезать нельзя, нужна перегенерация "
              "на сплошной магенте (см. ASSET_PROMPTS.md).")
    if args.grid:
        cols, rows = (int(v) for v in args.grid.lower().split("x"))
        rgba = regrid(rgba, cols, rows, args.cell, args.pad, args.clean, args.anchor)
        print(f"сетка {cols}x{rows}, клетка {args.cell} -> {rgba.shape[1]}x{rgba.shape[0]}")
    Image.fromarray(rgba, "RGBA").save(args.dst)
    print("сохранено:", args.dst)


if __name__ == "__main__":
    main()
