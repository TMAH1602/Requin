import { invoke, isTauri } from "@tauri-apps/api/core";

export async function saveText(
  name: string,
  content: string,
  type = "text/plain",
) {
  if(document.body.dataset.tutorial==='active')return 'Practice export (not written to disk)';
  name =
    name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() ||
    "Requin-export.txt";
  if (isTauri()) return invoke<string | null>("save_export", { name, content });
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export function serializeFigure(node: SVGSVGElement) {
  const copy = node.cloneNode(true) as SVGSVGElement;
  // Exported SVGs have no access to the app's CSS variables or inherited styles.
  const originals = [node, ...node.querySelectorAll<SVGElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<SVGElement>("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of [
      "fill",
      "stroke",
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "opacity",
    ]) {
      copies[index].style.setProperty(
        property,
        style.getPropertyValue(property),
      );
    }
  });
  const bounds = node.getBoundingClientRect();
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(bounds.width));
  copy.setAttribute("height", String(bounds.height));
  const background = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute(
    "fill",
    getComputedStyle(node.closest(".figure")!).backgroundColor,
  );
  copy.prepend(background);
  return new XMLSerializer().serializeToString(copy);
}
