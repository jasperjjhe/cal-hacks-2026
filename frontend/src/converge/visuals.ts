// Illustrative product photography. The backend returns no images, so a photo
// is chosen from the product title and is always captioned as illustrative.
export type Visual = { src: string; alt: string } | null;

const headphones = [
  "/converge/products/hp-sony.png",
  "/converge/products/hp-bose.png",
  "/converge/products/hp-skullcandy.png",
];
const laptops = [
  "/images/laptop-workspace.png",
  "/images/laptop-studio.png",
  "/images/laptop-editing.png",
];

const headphoneByBrand: [RegExp, string][] = [
  [/sony|xm\d/i, "/converge/products/hp-sony.png"],
  [/bose|quietcomfort/i, "/converge/products/hp-bose.png"],
];

export function productVisual(title: string, index: number): Visual {
  const alt = `${title} — illustrative photo, see the exact configuration in the details`;
  if (/headphone|earbud|buds|over-ear|on-ear|sennheiser|momentum|sony wh|bose|xm\d|quietcomfort|cush/i.test(title)) {
    const branded = headphoneByBrand.find(([brand]) => brand.test(title));
    return { src: branded?.[1] ?? headphones[2], alt };
  }
  if (/laptop|macbook|thinkpad|demothink|demobook|framework|zenbook/i.test(title))
    return { src: laptops[index % laptops.length], alt };
  return null;
}

/**
 * One stock laptop image has a small teal corner mark baked in. `.is-cropped`
 * zooms 8% from the bottom-left, which pushes the mark out of frame without
 * touching the other photos.
 */
export const photoClass = (src: string) =>
  src.includes("laptop-workspace") ? "is-cropped" : undefined;

export const galleryFor = (title: string, index: number): string[] => {
  const visual = productVisual(title, index);
  if (!visual) return [];
  return visual.src.includes("/products/")
    ? [
        "/converge/products/hp-gallery-2.jpg",
        "/converge/products/hp-gallery-3.jpg",
      ]
    : laptops;
};

export const loaderPhotos = [
  "/converge/products/hp-loader-1.png",
  "/converge/products/hp-loader-2.png",
  "/converge/products/hp-loader-3.png",
  "/converge/products/hp-loader-4.png",
  "/converge/products/hp-loader-5.png",
];
