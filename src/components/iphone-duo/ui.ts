const asset = (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

export type UIKind = "inner" | "outer";
export type DefaultTheme = "wallpaper" | "launcher";
export type DefaultUIs = Record<DefaultTheme, Record<UIKind, HTMLCanvasElement>>;

async function loadImage(name: string) {
  const image = new Image();
  image.src = asset(`iphone-duo/ui/${name}`);
  await image.decode();
  return image;
}

export async function loadDefaultUIs(): Promise<DefaultUIs> {
  const images = Object.fromEntries(
    await Promise.all(
      [
        "wallpaper-inner.avif",
        "clock-inner.avif",
        "clock-outer.avif",
        "launcher-inner.png",
        "launcher-outer.png",
      ].map(async name => [name, await loadImage(name)])
    )
  ) as Record<string, HTMLImageElement>;

  const themes = {
    wallpaper: {} as Record<UIKind, HTMLCanvasElement>,
    launcher: {} as Record<UIKind, HTMLCanvasElement>,
  };
  const innerWidth = 1600;

  for (const theme of ["wallpaper", "launcher"] as const) {
    for (const kind of ["inner", "outer"] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = kind === "inner" ? innerWidth : 774;
      canvas.height = 1125;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2d canvas unavailable");
      if (theme === "wallpaper") {
        context.drawImage(
          images["wallpaper-inner.avif"],
          canvas.width - innerWidth,
          0,
          innerWidth,
          canvas.height
        );
        context.drawImage(
          images[`clock-${kind}.avif`],
          0,
          0,
          canvas.width,
          canvas.height
        );
      } else {
        const crop =
          kind === "inner" ? [22, 22, 1072, 754] : [28, 16, 510, 742];
        context.drawImage(
          images[`launcher-${kind}.png`],
          crop[0],
          crop[1],
          crop[2],
          crop[3],
          0,
          0,
          canvas.width,
          canvas.height
        );
      }
      themes[theme][kind] = canvas;
    }
  }

  return themes;
}
