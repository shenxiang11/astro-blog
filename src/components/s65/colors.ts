export type PaintId =
  | "00"
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08";

export type Paint = {
  id: PaintId;
  hex: string;
  rough: number;
  metal: number;
  swatch: string;
};

export const PAINTS: Paint[] = [
  { id: "00", hex: "#25d6e9", rough: 0, metal: 0.16, swatch: "b1.webp" },
  { id: "01", hex: "#7c8670", rough: 0, metal: 0.17, swatch: "b2.webp" },
  { id: "02", hex: "#9C9C9C", rough: 0, metal: 0.16, swatch: "b3.webp" },
  { id: "03", hex: "#D9D9D9", rough: 0, metal: 0.16, swatch: "b4.webp" },
  { id: "04", hex: "#7C6D83", rough: 0.03, metal: 0.27, swatch: "b5.webp" },
  { id: "05", hex: "#d15523", rough: 0.13, metal: 0.16, swatch: "b6.webp" },
  { id: "06", hex: "#7495be", rough: 0, metal: 0.16, swatch: "b7.webp" },
  { id: "07", hex: "#54657f", rough: 0.12, metal: 0.16, swatch: "b8.webp" },
  { id: "08", hex: "#2a2933", rough: 0, metal: 0.77, swatch: "b9.webp" },
];
