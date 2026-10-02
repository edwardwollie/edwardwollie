// Standard blueprint view directions (unit faces +Z, its left side is +X, +Y up).
// `dir` points from the model towards the camera; `up` is the screen-up vector.
export const VIEWS = {
  front: { label: "FRONT", dir: [0, 0, 1], up: [0, 1, 0], ortho: true },
  rear: { label: "REAR", dir: [0, 0, -1], up: [0, 1, 0], ortho: true },
  left: { label: "LEFT", dir: [1, 0, 0], up: [0, 1, 0], ortho: true },
  right: { label: "RIGHT", dir: [-1, 0, 0], up: [0, 1, 0], ortho: true },
  top: { label: "TOP", dir: [0, 1, 0], up: [0, 0, -1], ortho: true },
  bottom: { label: "UNDERSIDE", dir: [0, -1, 0], up: [0, 0, -1], ortho: true },
  quarterFront: { label: "QUARTER FRONT-LEFT", dir: [0.66, 0.38, 0.66], up: [0, 1, 0], ortho: false },
  quarterRear: { label: "QUARTER REAR-RIGHT", dir: [-0.66, 0.38, -0.66], up: [0, 1, 0], ortho: false }
};

export const ORTHO_VIEWS = ["front", "rear", "left", "right", "top", "bottom"];

/** Which bounding-box axes a view shows horizontally and vertically (for dimension callouts). */
export const VIEW_AXES = {
  front: ["x", "y"],
  rear: ["x", "y"],
  left: ["z", "y"],
  right: ["z", "y"],
  top: ["x", "z"],
  bottom: ["x", "z"]
};
