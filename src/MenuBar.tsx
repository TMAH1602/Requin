import { useEffect, useRef, useState } from "react";
import { VERSION } from "./version";

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  shortcut?: string;
}
export function MenuBar({
  menus,
}: {
  menus: { label: string; items: MenuItem[] }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const focusItem = (index: number) =>
    requestAnimationFrame(() => {
      const items = root.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );
      if (items?.length) items[(index + items.length) % items.length].focus();
    });
  useEffect(() => {
    if (open === null) return;
    const outside = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const blur = () => setOpen(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("blur", blur);
    };
  }, [open]);
  return (
    <nav
      className="menubar"
      aria-label="Application menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open !== null) {
          e.preventDefault();
          triggers.current[open]?.focus();
          setOpen(null);
        }
        if (e.key === "Tab") setOpen(null);
        if (
          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
          open !== null
        ) {
          e.preventDefault();
          const next =
            (open + (e.key === "ArrowRight" ? 1 : menus.length - 1)) %
            menus.length;
          setOpen(next);
          triggers.current[next]?.focus();
          focusItem(0);
        }
      }}
    >
      {menus.map((menu, index) => (
        <div className="menu" key={menu.label}>
          <button
            data-tour-id={menu.label==='Export'?'export-menu':undefined}
            className="menu-trigger"
            ref={(el) => {
              triggers.current[index] = el;
            }}
            aria-haspopup="menu"
            aria-expanded={open === index}
            aria-controls={`menu-${index}`}
            onClick={() => setOpen(open === index ? null : index)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(index);
                focusItem(e.key === "ArrowUp" ? -1 : 0);
              }
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <div
              className="menu-popover"
              role="menu"
              id={`menu-${index}`}
              aria-label={menu.label}
              onKeyDown={(e) => {
                const items = [
                  ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                ];
                const current = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  e.key === "ArrowDown"
                    ? current + 1
                    : e.key === "ArrowUp"
                      ? current - 1
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? items.length - 1
                          : null;
                if (next !== null) {
                  e.preventDefault();
                  focusItem(next);
                }
              }}
            >
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(null);
                    triggers.current[index]?.focus();
                    item.action();
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <span>
        REQUIN <span className="version">{VERSION}</span>
      </span>
    </nav>
  );
}
