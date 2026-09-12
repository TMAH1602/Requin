import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type SelectHTMLAttributes,
  type ReactElement,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, value, onChange, disabled } = props;
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const p = (
        child as ReactElement<{
          value?: string;
          children?: string;
          disabled?: boolean;
        }>
      ).props;
      return {
        value: String(p.value ?? p.children ?? ""),
        label: String(p.children ?? ""),
        disabled: p.disabled,
      };
    });
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [rect, setRect] = useState({ left: 0, top: 0, width: 200, maxHeight: 280 }),
    [theme, setTheme] = useState("mocha");
  const search = useRef({ text: "", time: 0 });
  const close = (focus = false) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  const show = () => {
    if (disabled) return;
    const r = trigger.current!.getBoundingClientRect();
    const below = innerHeight - r.bottom - 16;
    const height = Math.min(options.length * 40 + 12, 300);
    setRect({
      left: Math.max(
        8,
        Math.min(r.left, innerWidth - Math.max(r.width, 220) - 8),
      ),
      top:
        below >= Math.min(height, 160)
          ? r.bottom + 6
          : Math.max(8, r.top - height - 6),
      width: Math.max(r.width, 220),
      maxHeight:
        below >= Math.min(height, 160)
          ? Math.max(120, Math.min(300, below))
          : Math.min(300, r.top - 16),
    });
    setTheme(
      document.querySelector("main")?.getAttribute("data-theme") ?? "mocha",
    );
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === String(value)),
      ),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (
        !popup.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        close();
    };
    const blur = () => close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelectorAll("button")
        [active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const choose = (i: number) => {
    if (options[i]?.disabled) return;
    onChange?.({
      target: { value: options[i].value },
      currentTarget: { value: options[i].value },
    } as ChangeEvent<HTMLSelectElement>);
    close(true);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="select-control"
        role="combobox"
        aria-label={props["aria-label"]}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close(true);
            return;
          }
          if (e.key === "Tab") {
            close();
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            if (!open) {
              show();
              return;
            }
            let i =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : (active +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length;
            for (let n = 0; options[i]?.disabled && n < options.length; n++)
              i = (i + 1) % options.length;
            setActive(i);
          } else if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            choose(active);
          } else if (e.key.length === 1) {
            search.current = {
              text:
                Date.now() - search.current.time < 700
                  ? search.current.text + e.key
                  : e.key,
              time: Date.now(),
            };
            const i = options.findIndex(
              (o) =>
                !o.disabled &&
                o.label
                  .toLowerCase()
                  .startsWith(search.current.text.toLowerCase()),
            );
            if (!open) show();
            if (i >= 0) setActive(i);
          }
        }}
      >
        <span>
          {options.find((o) => o.value === String(value))?.label ??
            options[0]?.label}
        </span>
        <ChevronDown size={15} />
      </button>
      {open &&
        createPortal(
          <div
            className="select-portal"
            data-theme={theme}
            ref={popup}
            id={id}
            role="listbox"
            aria-label={props["aria-label"]}
            style={{
              position: "fixed",
              ...rect,
              zIndex: 4500,
              overflowY: "auto",
            }}
          >
            {options.map((o, i) => (
              <button
                id={`${id}-${i}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={o.value === String(value)}
                disabled={o.disabled}
                className={active === i ? "highlighted" : ""}
                key={o.value}
                onPointerMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {o.value === String(value) && <Check size={14} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
