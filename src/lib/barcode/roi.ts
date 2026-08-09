// Where the aiming rectangle actually falls on the camera frame.
//
// The preview is drawn with object-cover, which scales the frame to fill the
// viewport and pushes the overflow off-screen. A 16:9 landscape stream in a
// portrait phone loses roughly three quarters of its width that way, so the
// decoder was reading mostly pixels the user could not see and had never aimed
// at, while the barcode they had lined up sat in a fraction of the frame.
//
// These map from what is on screen back to the source frame, so the decode can
// be cropped to the rectangle the user framed, and so a tap can tell the camera
// where in its own picture to focus.

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

function usable(size: Size): boolean {
  // videoWidth is 0 until the first frame arrives, and a hidden element boxes
  // to 0. Either way there is nothing to map yet.
  return size.width > 0 && size.height > 0;
}

// How object-cover lays a frame of `source` size into a box of `box` size: the
// scale it is drawn at, and where its top left corner lands in box coordinates,
// which is negative on whichever axis is cropped.
export function coverLayout(source: Size, box: Size) {
  const scale = Math.max(box.width / source.width, box.height / source.height);
  return {
    scale,
    left: (box.width - source.width * scale) / 2,
    top: (box.height - source.height * scale) / 2,
  };
}

// The crop of the source frame that the on-screen `aim` rectangle covers.
//
// `pad` grows the rectangle by a fraction of its size on each side before the
// conversion, because a barcode that pokes slightly outside the guide is still
// one the user meant to scan, and a decoder needs the quiet zone either side of
// the bars to find the edges at all.
export function sourceRect(
  source: Size,
  box: Size,
  aim: Rect,
  pad = 0,
): Rect | null {
  if (!usable(source) || !usable(box)) return null;

  const { scale, left, top } = coverLayout(source, box);

  const grownX = aim.x - aim.width * pad;
  const grownY = aim.y - aim.height * pad;
  const grownWidth = aim.width * (1 + pad * 2);
  const grownHeight = aim.height * (1 + pad * 2);

  const width = Math.min(Math.round(grownWidth / scale), source.width);
  const height = Math.min(Math.round(grownHeight / scale), source.height);
  if (width < 1 || height < 1) return null;

  return {
    x: clamp(Math.round((grownX - left) / scale), 0, source.width - width),
    y: clamp(Math.round((grownY - top) / scale), 0, source.height - height),
    width,
    height,
  };
}

// A point on screen as a fraction of the source frame, which is the shape the
// pointsOfInterest camera constraint wants. Points outside the visible crop
// clamp to the edge rather than being refused: the camera would reject an
// out-of-range value and we would lose the focus hint entirely.
export function normalizedPoint(
  source: Size,
  box: Size,
  point: Point,
): Point | null {
  if (!usable(source) || !usable(box)) return null;

  const { scale, left, top } = coverLayout(source, box);
  return {
    x: clamp((point.x - left) / scale / source.width, 0, 1),
    y: clamp((point.y - top) / scale / source.height, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
