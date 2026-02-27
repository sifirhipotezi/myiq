from PIL import Image
import numpy as np, cv2, os, glob, shutil, csv, sys
from pathlib import Path

def row_segments(mask, th):
    row_counts = mask.sum(axis=1)
    segs=[]; in_seg=False
    for i,c in enumerate(row_counts):
        if c>th and not in_seg:
            s=i; in_seg=True
        elif c<=th and in_seg:
            segs.append((s,i-1))
            in_seg=False
    if in_seg: segs.append((s,len(row_counts)-1))
    return segs

def col_segments(mask, th):
    col_counts = mask.sum(axis=0)
    segs=[]; in_seg=False
    for i,c in enumerate(col_counts):
        if c>th and not in_seg:
            s=i; in_seg=True
        elif c<=th and in_seg:
            segs.append((s,i-1))
            in_seg=False
    if in_seg: segs.append((s,len(col_counts)-1))
    return segs

def bbox_from_mask(mask):
    ys, xs = np.where(mask)
    if len(xs)==0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()

def pad_bbox(bbox, pad, W, H):
    x1,y1,x2,y2 = bbox
    return max(0,x1-pad), max(0,y1-pad), min(W-1,x2+pad), min(H-1,y2+pad)

def crop_bbox(img, bbox):
    x1,y1,x2,y2 = bbox
    return img[y1:y2+1, x1:x2+1]

def default_label(page_num):
    if page_num <= 11:
        return f'item_{10+page_num}'
    elif page_num == 12:
        return 'sample_c'
    else:
        return f'item_{9+page_num}'

def split_pages(page_paths, out_root):
    out_root = Path(out_root)
    out_root.mkdir(parents=True, exist_ok=True)
    manifest = []
    for idx, path in enumerate(page_paths, start=1):
        label = default_label(idx)
        img = np.array(Image.open(path).convert('RGB'))
        H, W = img.shape[:2]
        mask = np.any(img < 250, axis=2)
        rsegs = row_segments(mask, max(80, W//25))
        candidates = [(s,e) for s,e in rsegs if s > H*0.45 and (e-s+1) > H*0.08]
        if not candidates:
            candidates = [(s,e) for s,e in rsegs if s > H*0.35]
        best = None
        for s,e in candidates:
            band = mask[s:e+1,:]
            csegs = col_segments(band, max(30, (e-s+1)//8))
            key = (-(abs(len(csegs)-6)), int(band.sum()))
            if best is None or key > best[0]:
                best = (key, s,e,csegs)
        if best is None:
            raise RuntimeError(f'no option band found for {path}')
        _, opt_y1, opt_y2, csegs = best
        if len(csegs) != 6:
            band = mask[opt_y1:opt_y2+1,:]
            for th in [20,30,40,50,60,70,80,100,120]:
                test = col_segments(band, th)
                if len(test) == 6:
                    csegs = test
                    break
        if len(csegs) != 6:
            raise RuntimeError(f'expected 6 options, got {len(csegs)} for {path}')
        top_mask = mask[:max(0, opt_y1-20), :]
        stem_bbox_local = bbox_from_mask(top_mask)
        stem_bbox = pad_bbox(stem_bbox_local, 12, W, H)
        item_dir = out_root / label
        item_dir.mkdir(exist_ok=True)
        stem_path = item_dir / f'{label}_stem.png'
        Image.fromarray(crop_bbox(img, stem_bbox)).save(stem_path)
        row = {'page': idx, 'label': label, 'stem_path': str(stem_path.relative_to(out_root))}
        for j,(x1,x2) in enumerate(csegs, start=1):
            local = mask[opt_y1:opt_y2+1, x1:x2+1]
            bb = bbox_from_mask(local)
            lx1,ly1,lx2,ly2 = bb
            bbox = pad_bbox((x1+lx1, opt_y1+ly1, x1+lx2, opt_y1+ly2), 10, W, H)
            opath = item_dir / f'{label}_option_{j}.png'
            Image.fromarray(crop_bbox(img, bbox)).save(opath)
            row[f'option_{j}_path'] = str(opath.relative_to(out_root))
        manifest.append(row)
    with open(out_root / 'manifest.csv', 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['page','label','stem_path'] + [f'option_{i}_path' for i in range(1,7)]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(manifest)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('usage: python split_nonverbal_items.py <rendered_pages_glob> <output_dir>')
        raise SystemExit(1)
    page_paths = sorted(glob.glob(sys.argv[1]))
    split_pages(page_paths, sys.argv[2])
