import { memo } from "react";
import katex from "katex";
const MathText = memo(function MathText({
  tex,
  display = false,
}: {
  tex: string;
  display?: boolean;
}) {
  let markup: string;
  try {
    markup = katex.renderToString(tex, {
      throwOnError: true,
      displayMode: display,
      strict: false,
      output: "mathml",
    });
  } catch {
    markup = `<code>${tex.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code>`;
  }
  return (
    <span
      className={display ? "math-display" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});
export default MathText;
