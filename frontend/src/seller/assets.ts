import type { ProductImage } from "./inventory.ts";
import framework16 from "./assets/framework-16.jpg";
import framework13 from "./assets/framework-13.jpg";
import framework12 from "./assets/framework-12.jpg";
import standingDesk from "./assets/standing-desk.jpg";
import deskKit from "./assets/desk-kit.jpg";
import monitorArm from "./assets/monitor-arm.jpg";

export { default as analyticsIcon } from "./assets/analytics.svg";
export { default as packageIcon } from "./assets/package.svg";
export { default as bookmarkIcon } from "./assets/bookmark.svg";
export { default as mascot } from "./assets/mascot.svg";
export { default as workspaceIcon } from "./assets/gallery-vertical-end.svg";
export { default as chevronsUpDown } from "./assets/chevrons-up-down.svg";
export { default as overviewIcon } from "./assets/overview.svg";
export { default as chevronDown } from "./assets/chevron-down.svg";
export { default as subLine } from "./assets/sub-line.svg";
export { default as inventoryIcon } from "./assets/inventory.svg";
export { default as productsIcon } from "./assets/products.svg";
export { default as chevronRight } from "./assets/chevron-right.svg";
export { default as ordersIcon } from "./assets/orders.svg";
export { default as avatarCoral } from "./assets/avatar-coral.svg";
export { default as searchIcon } from "./assets/search-icon.svg";
export { default as searchHandle } from "./assets/search-handle.svg";
export { default as uploadIcon } from "./assets/upload.svg";
export { default as plusIcon } from "./assets/plus.svg";
export { default as slidersIcon } from "./assets/sliders.svg";
export { default as ellipseRevenue } from "./assets/ellipse-revenue.svg";
export { default as ellipseReach } from "./assets/ellipse-reach.svg";
export { default as ellipseInner } from "./assets/ellipse-inner.svg";
export { default as legendRevenue } from "./assets/legend-revenue.svg";
export { default as legendVariable } from "./assets/legend-variable.svg";
export { default as legendFixed } from "./assets/legend-fixed.svg";
export { default as legendDashed } from "./assets/legend-dashed.svg";
export { default as legendSolid } from "./assets/legend-solid.svg";
export { default as arrowLeft } from "./assets/arrow-left.svg";
export { default as arrowRight } from "./assets/arrow-right.svg";

export const productImages: Record<ProductImage, string> = {
  "framework-16": framework16,
  "framework-13": framework13,
  "framework-12": framework12,
  "standing-desk": standingDesk,
  "desk-kit": deskKit,
  "monitor-arm": monitorArm,
};
