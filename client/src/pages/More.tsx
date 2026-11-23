import type { ReactNode } from "react";
import {
  cardCls,
  IconBox,
  IconChevronRight,
  IconGear,
  IconLayers,
  IconMilkBottle,
} from "../ui";
import type { Page } from "../App";

const ROWS: {
  page: Page;
  title: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    page: "ingredients",
    title: "Ingredients",
    description: "What everything is made from — with vendor prices",
    icon: <IconMilkBottle />,
  },
  {
    page: "packaging",
    title: "Packaging",
    description: "Boxes, boards, and everything a cake lives in — with unit costs",
    icon: <IconBox />,
  },
  {
    page: "components",
    title: "Components",
    description: "Reusable sub-recipes: frostings, ganaches, fillings",
    icon: <IconLayers />,
  },
  {
    page: "settings",
    title: "Settings",
    description: "Labour and utility rates, plus import and backup",
    icon: <IconGear />,
  },
];

export function MorePage({ go }: { go: (p: Page) => void }) {
  return (
    <div>
      <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
        More
      </h1>
      <p className="text-sm text-[var(--dim)] mt-1">
        The rest of the toolbox
      </p>
      <div className="mt-6 grid gap-3 max-w-2xl">
        {ROWS.map((r) => (
          <button
            key={r.page}
            type="button"
            onClick={() => go(r.page)}
            className={`${cardCls} w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#f9ecd7] transition-colors`}
            aria-label={`Go to ${r.title}`}
          >
            <span className="text-[#ae8a3e]">{r.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-heading text-lg font-medium text-[#2c1e16]">
                {r.title}
              </span>
              <span className="block text-sm text-[var(--dim)]">{r.description}</span>
            </span>
            <span className="text-[var(--dim)]">
              <IconChevronRight />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
