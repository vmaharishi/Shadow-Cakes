import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileToBase64 } from "@hatch/space-sdk/client";
import { api } from "../api";
import {
  FIELDS,
  canShareFile,
  money,
  shareFileOnly,
  stamp,
  triggerDownload,
  useSettings,
  useSymbol,
  type QuoteBanner,
  type QuoteItem,
  type Recipe,
  type Variant,
} from "../lib";
import {
  btnIconSmall,
  btnPrimary,
  cardCls,
  EmptyState,
  ErrorNote,
  inputCls,
  Loading,
  Modal,
  useToast,
  IconChevronRight,
  IconPlus,
  IconShare,
  IconX,
} from "../ui";
import mascotUrl from "../assets/shadow-mascot.jpg";
import wordmarkUrl from "../assets/shadow-logo-gold.png";

// ---------- quote image ----------

/** "$75" for whole dollars, "$75.50" otherwise — the image reads like
 *  a price list, not an invoice. */
function imagePrice(n: number, symbol: string): string {
  return Number.isInteger(n) ? `${symbol}${n}` : money(n, symbol);
}

function loadLogoImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Loads the selected banner for the canvas. The banner URL points at
 * blob storage; fetching the bytes and drawing from an object URL
 * keeps the canvas untainted (a cross-origin <img> would block
 * toBlob). Returns the image and the object URL to revoke afterwards.
 */
async function loadBannerImage(
  url: string,
): Promise<{ img: HTMLImageElement; objectUrl: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });
    if (!img) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    return { img, objectUrl };
  } catch {
    return null;
  }
}

const BANNER_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
type BannerMime = (typeof BANNER_MIMES)[number];

/**
 * Prepares a picked banner file for addQuoteBanner. Banners are wide
 * graphics, so PNG stays PNG (re-encoding a flat-colour banner as JPEG
 * would shift its cream); photos picked as banners go JPEG. Anything
 * over 1600px wide is downscaled first.
 */
async function prepareBannerImage(
  file: File,
): Promise<{ dataBase64: string; mimeType: BannerMime }> {
  const asIs = async (): Promise<{ dataBase64: string; mimeType: BannerMime }> => {
    const { dataBase64, mimeType } = await fileToBase64(file);
    if ((BANNER_MIMES as readonly string[]).includes(mimeType)) {
      return { dataBase64, mimeType: mimeType as BannerMime };
    }
    throw new Error("Please choose a JPEG, PNG, or WebP image.");
  };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return asIs();
  }
  try {
    if (bmp.width <= 1600 && file.size <= 2_000_000) return await asIs();
    const scale = Math.min(1, 1600 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const cx = canvas.getContext("2d");
    if (!cx) return await asIs();
    cx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const keepPng = file.type === "image/png" || file.type === "image/webp";
    const blob = await new Promise<Blob | null>((resolve) =>
      keepPng
        ? canvas.toBlob(resolve, "image/png")
        : canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) return await asIs();
    const { dataBase64 } = await fileToBase64(blob);
    return {
      dataBase64,
      mimeType: keepPng ? "image/png" : "image/jpeg",
    };
  } finally {
    bmp.close();
  }
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** The one background the quote image always uses — the cream her
 *  banner artwork sits on, so a banner melts into the page seamlessly. */
const QUOTE_BG = "#fff3d7";

/**
 * Renders the customer-facing quote image on the #fff3d7 cream. When
 * a banner is selected it spans the full width at the very top at its
 * natural aspect ratio (the banner carries the branding, so no title
 * follows it); with no banner, the fallback header is her two logo
 * images side by side and nothing else — the dog mascot on the left
 * and the "Shadow" wordmark on the right, a centred pair at matched
 * heights, both melted in with multiply (the same trick the CSS
 * uses, so their white/transparent surrounds disappear into the
 * cream) — followed by a gap in step with the top and bottom padding,
 * so the no-banner image's height hugs its content. The items are one
 * flat list — no category headings — each name with a dotted leader
 * to its price, and her footer text at the foot. No costs, margins,
 * or notes — only what a customer should see.
 */
async function renderQuotePng(
  items: QuoteItem[],
  footerText: string,
  symbol: string,
  banner: QuoteBanner | null,
): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load('700 30px "Manrope"'),
      document.fonts.load('400 34px "Manrope"'),
      document.fonts.load('500 32px "JetBrains Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fall back to whatever fonts are already loaded.
  }
  const loadedBanner = banner?.url ? await loadBannerImage(banner.url) : null;
  // No-banner fallback header: her two logos as a centred pair at
  // matched heights — dog mascot left, "Shadow" wordmark right.
  const [mascot, wordmark] = loadedBanner
    ? [null, null]
    : await Promise.all([
        loadLogoImage(mascotUrl),
        loadLogoImage(wordmarkUrl),
      ]);
  const pairImgs = [mascot, wordmark].filter(
    (img): img is HTMLImageElement => img != null,
  );

  const W = 1080;
  const PAD = 76;
  const contentW = W - PAD * 2;
  // Vertical layout, top to bottom — the height is summed from the
  // same increments the draw pass advances by.
  const bannerH = loadedBanner
    ? Math.round(
        (W * loadedBanner.img.naturalHeight) / loadedBanner.img.naturalWidth,
      )
    : 0;
  const PAIR_GAP = 44;
  let pairH = pairImgs.length ? 220 : 0;
  let pairW = pairImgs.reduce(
    (sum, img) => sum + (pairH * img.naturalWidth) / img.naturalHeight,
    0,
  ) + (pairImgs.length > 1 ? PAIR_GAP : 0);
  if (pairW > contentW) {
    pairH = Math.round(pairH * (contentW / pairW));
    pairW = contentW;
  }
  // No-banner spacing: an even rhythm top to bottom — top padding,
  // logos→items gap, and bottom padding all in the same range, so no
  // single void dwarfs the others and the height hugs the content.
  // (The banner variant keeps its own spacing: the banner sets the top.)
  const NO_BANNER_TOP = 72;
  const NO_BANNER_GAP = 88;
  const NO_BANNER_BOTTOM = 64;
  const headerH = loadedBanner
    ? bannerH + 44
    : NO_BANNER_TOP + pairH + NO_BANNER_GAP;
  // Her footer text, one canvas line per typed line.
  const footerLines = footerText.split("\n");
  const FOOTER_LINE_H = 38;
  const height =
    headerH +
    items.length * 62 +
    8 +
    26 +
    2 +
    58 +
    (footerLines.length - 1) * FOOTER_LINE_H +
    (loadedBanner ? 52 : NO_BANNER_BOTTOM);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create the quote image.");

  ctx.fillStyle = QUOTE_BG;
  ctx.fillRect(0, 0, W, height);

  let y = 0;
  if (loadedBanner) {
    ctx.drawImage(loadedBanner.img, 0, 0, W, bannerH);
    y = bannerH + 44;
  } else {
    y = NO_BANNER_TOP;
    if (pairImgs.length) {
      let x = Math.round((W - pairW) / 2);
      ctx.globalCompositeOperation = "multiply";
      for (const img of pairImgs) {
        const w = Math.round((pairH * img.naturalWidth) / img.naturalHeight);
        ctx.drawImage(img, x, y, w, pairH);
        x += w + PAIR_GAP;
      }
      ctx.globalCompositeOperation = "source-over";
      y += pairH;
    }
    // The logos are the whole header — a clear breath of cream before
    // the first item, in step with the top and bottom padding.
    y += NO_BANNER_GAP;
  }

  for (const item of items) {
    const label = `${item.recipe_name} · ${item.variant_name}`;
    const price = imagePrice(item.price, symbol);
    ctx.font = '500 32px "JetBrains Mono", monospace';
    const priceW = ctx.measureText(price).width;
    const priceX = W - PAD - priceW;
    ctx.font = '400 34px "Manrope", sans-serif';
    const maxLabelW = priceX - PAD - 56;
    const text = truncateToWidth(ctx, label, maxLabelW);
    const textW = ctx.measureText(text).width;
    ctx.textAlign = "left";
    ctx.fillStyle = "#2b2019";
    ctx.fillText(text, PAD, y + 36);
    // Dotted leader between the item and its price.
    const dot = "·";
    const dotW = Math.max(6, ctx.measureText(dot).width);
    const from = PAD + textW + 18;
    const to = priceX - 18;
    ctx.fillStyle = "#c9b48a";
    for (let x = from; x < to; x += dotW + 7) {
      ctx.fillText(dot, x, y + 36);
    }
    ctx.font = '500 32px "JetBrains Mono", monospace';
    ctx.fillStyle = "#2c1e16";
    ctx.fillText(price, priceX, y + 36);
    y += 62;
  }

  y += 8 + 26;
  ctx.fillStyle = "#e7dbc2";
  ctx.fillRect(PAD, y, contentW, 2);
  y += 2 + 58;
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b5d4f";
  ctx.font = '400 27px "Manrope", sans-serif';
  for (const line of footerLines) {
    ctx.fillText(truncateToWidth(ctx, line, contentW), W / 2, y);
    y += FOOTER_LINE_H;
  }

  if (loadedBanner) URL.revokeObjectURL(loadedBanner.objectUrl);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't create the quote image.");
  return blob;
}

/**
 * One banner thumbnail in the strip. If the image fails to load (a
 * banner written moments ago can briefly fail in the browser), the
 * tile falls back to a calm cream placeholder with the banner's name
 * instead of the browser's broken-image glyph; a fresh URL from the
 * next list refresh resets it.
 */
function BannerThumb({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <span className="flex aspect-[37/10] w-full items-center justify-center bg-[#fff3d7] text-xs text-[var(--dim)]">
        {name}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} banner`}
      className="block aspect-[37/10] w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// ---------- page ----------

export function QuotePage() {
  const symbol = useSymbol();
  const settingsQ = useSettings();
  const footerText = settingsQ.data?.quote_footer_text ?? "Prices in CAD";
  const toast = useToast();
  const qc = useQueryClient();

  const quoteQ = useQuery({
    queryKey: ["quote"],
    queryFn: () => api.getQuote({}),
  });
  const bannersQ = useQuery({
    queryKey: ["quote-banners"],
    queryFn: () => api.listQuoteBanners({}),
  });
  const banners = useMemo(
    () => bannersQ.data?.banners ?? [],
    [bannersQ.data],
  );
  const selectedBanner = useMemo(
    () => banners.find((b) => b.selected) ?? null,
    [banners],
  );
  const recipesQ = useQuery({
    queryKey: ["recipes"],
    queryFn: () => api.listRecipes({}),
  });
  const items = useMemo(() => quoteQ.data?.items ?? [], [quoteQ.data]);
  const recipes = useMemo(() => recipesQ.data?.recipes ?? [], [recipesQ.data]);

  const selectedByKey = useMemo(() => {
    const map = new Map<string, QuoteItem>();
    for (const it of items) map.set(`${it.recipe_id}:${it.variant_id}`, it);
    return map;
  }, [items]);

  const [search, setSearch] = useState("");
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const invalidate = () => qc.invalidateQueries({ queryKey: ["quote"] });
  const addItem = useMutation({
    mutationFn: (args: { recipe_id: string; variant_id: string }) =>
      api.addQuoteItem(args),
    onSuccess: invalidate,
    onError: (e) => toast(e.message, "error"),
  });
  const removeItem = useMutation({
    mutationFn: (id: string) => api.removeQuoteItem({ id }),
    onSuccess: invalidate,
    onError: (e) => toast(e.message, "error"),
  });

  // ----- banners -----
  const invalidateBanners = () =>
    qc.invalidateQueries({ queryKey: ["quote-banners"] });
  const selectBanner = useMutation({
    mutationFn: (id: string | null) => api.selectQuoteBanner({ id }),
    onSuccess: invalidateBanners,
    onError: (e) => toast(e.message, "error"),
  });
  const deleteBanner = useMutation({
    mutationFn: (id: string) => api.deleteQuoteBanner({ id }),
    onSuccess: invalidateBanners,
    onError: (e) => toast(e.message, "error"),
  });
  const addBanner = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await prepareBannerImage(file);
      const name =
        file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Banner";
      return api.addQuoteBanner({
        name,
        data_base64: prepared.dataBase64,
        mime_type: prepared.mimeType,
      });
    },
    onSuccess: invalidateBanners,
    onError: (e) => toast(e.message, "error"),
  });

  const onBannerFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) addBanner.mutate(file);
  };

  // ----- footer text -----
  // The draft is local until she saves; null means "showing the saved
  // text", so a background settings refresh never eats her typing.
  const [footerDraft, setFooterDraft] = useState<string | null>(null);
  const footerValue = footerDraft ?? footerText;
  const footerDirty = footerDraft != null && footerDraft !== footerText;
  const saveFooter = useMutation({
    mutationFn: (text: string) => api.updateQuoteFooterText({ text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setFooterDraft(null);
      toast("Footer text saved");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const togglePending = (key: string, on: boolean) =>
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleVariant = (recipe: Recipe, variant: Variant) => {
    const key = `${recipe.id}:${variant.id}`;
    if (pendingKeys.has(key)) return;
    const existing = selectedByKey.get(key);
    togglePending(key, true);
    if (existing) {
      removeItem.mutate(existing.id, {
        onSettled: () => togglePending(key, false),
      });
    } else {
      addItem.mutate(
        { recipe_id: recipe.id, variant_id: variant.id },
        { onSettled: () => togglePending(key, false) },
      );
    }
  };

  // ----- add-items search -----
  // Search only: a recipe matches when its name (or category) matches,
  // in which case all its sizes are offered, or when one of its size
  // names matches, in which case just those sizes are offered. Each
  // match is an expandable recipe row; the sizes inside carry the tick
  // boxes, one per size — there is no select-all.
  const query = search.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!query) return [];
    const out: { recipe: Recipe; variants: Variant[] }[] = [];
    for (const r of recipes) {
      const recipeHit =
        r.name.toLowerCase().includes(query) ||
        (r.category ?? "").toLowerCase().includes(query);
      const variants = recipeHit
        ? r.variants
        : r.variants.filter((v) => v.name.toLowerCase().includes(query));
      if (recipeHit || variants.length > 0) out.push({ recipe: r, variants });
    }
    return out;
  }, [recipes, query]);

  const toggleSet = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    key: string,
  ) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  };

  const variantRow = (recipe: Recipe, variant: Variant) => {
    const key = `${recipe.id}:${variant.id}`;
    const selected = selectedByKey.has(key);
    return (
      <label
        key={key}
        className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[#fdf8ef] cursor-pointer"
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={pendingKeys.has(key)}
          onChange={() => toggleVariant(recipe, variant)}
          aria-label={`${selected ? "Remove" : "Add"} ${recipe.name} ${variant.name} ${selected ? "from" : "to"} the quote`}
        />
        <span className="flex-1 min-w-0 text-sm font-medium text-[#2c1e16]">
          {variant.name}
        </span>
        {selected ? (
          <span className="shrink-0 text-xs font-semibold text-[#4a6b53]">
            On quote
          </span>
        ) : null}
      </label>
    );
  };

  // One search result: the recipe as an expandable row; expanding it
  // shows its sizes, each with its own tick box.
  const searchResult = ({ recipe, variants }: { recipe: Recipe; variants: Variant[] }) => {
    const open = expandedRecipes.has(recipe.id);
    const onQuote = recipe.variants.filter((v) =>
      selectedByKey.has(`${recipe.id}:${v.id}`),
    ).length;
    return (
      <div key={recipe.id} className={`${cardCls} overflow-hidden`}>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-[#f9ecd7] transition-colors"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${recipe.name} sizes`}
          onClick={() => toggleSet(expandedRecipes, setExpandedRecipes, recipe.id)}
        >
          <span
            className={`text-[var(--dim)] transition-transform [&_svg]:w-4 [&_svg]:h-4 ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <IconChevronRight />
          </span>
          <span className="flex-1 min-w-0 font-heading text-lg font-medium text-[#2c1e16]">
            {recipe.name}
          </span>
          {onQuote > 0 ? (
            <span className="shrink-0 rounded-full bg-[#4a6b53]/10 border border-[#4a6b53]/30 px-2 py-0.5 text-xs font-semibold text-[#4a6b53]">
              {onQuote} on quote
            </span>
          ) : null}
          <span className="shrink-0 text-xs text-[var(--dim)]">
            {variants.length} size{variants.length === 1 ? "" : "s"}
          </span>
        </button>
        {open ? (
          <div className="border-t border-[var(--border)] px-2 py-2">
            {variants.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--dim)]">
                No sizes yet — add one on the recipe page.
              </p>
            ) : (
              variants.map((v) => variantRow(recipe, v))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  // ----- quote image file (pre-rendered so the tap can share it) -----
  const [prepared, setPrepared] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const filename = `shadow-cakes-quote-${stamp()}.png`;
  useEffect(() => {
    if (items.length === 0) {
      setPrepared(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await renderQuotePng(items, footerValue, symbol, selectedBanner);
          if (!cancelled) {
            setPrepared(new File([blob], filename, { type: "image/png" }));
          }
        } catch {
          if (!cancelled) setPrepared(null);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // filename is date-derived and stable for the day; items/footer/
    // symbol/selected banner are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, footerValue, symbol, selectedBanner]);

  // ----- quote image preview -----
  // The preview modal is the final step: it shows the very File that
  // Share will hand over, so what she sees is byte-for-byte what the
  // customer gets — the image with only its one action, Share. There
  // is no separate create step.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const previewUrl = useMemo(
    () => (previewOpen && prepared ? URL.createObjectURL(prepared) : null),
    [previewOpen, prepared],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /** The rendered quote image File, rendering it on the spot when the
   *  pre-render hasn't landed yet (she tapped fast). */
  const ensureFile = async (): Promise<File | null> => {
    if (prepared) return prepared;
    try {
      const blob = await renderQuotePng(items, footerValue, symbol, selectedBanner);
      const file = new File([blob], filename, { type: "image/png" });
      setPrepared(file);
      return file;
    } catch {
      return null;
    }
  };

  /** Share — the preview's one action. On a phone, Send and Download
   *  both ended at the same native share sheet anyway, and the
   *  in-app browser can't do a true standalone download (a
   *  programmatic blob-anchor click is silently dropped there), so
   *  there is just Share: it opens the phone's own share sheet with
   *  the image file ONLY — no title, text, or URL in the payload, so
   *  the recipient gets just the image — and from that sheet she can
   *  send it (WhatsApp, Messages, Instagram…) or keep a copy with
   *  the sheet's own Save Image / Save to Files. Where this browser
   *  has no file sharing at all (some desktop browsers), Share falls
   *  back to a plain browser download and says so in one line. The
   *  button stays disabled until the pre-rendered File exists, so
   *  the share call starts synchronously inside the tap — the
   *  webview only honours it during the tap's user gesture. */
  const onShare = async () => {
    const file = prepared ?? (await ensureFile());
    if (!file) {
      toast("The quote image couldn't be created — try again.", "error");
      return;
    }
    if (!canShareFile(file)) {
      triggerDownload(file, file.name);
      setStatus("Sharing isn't available in this browser, so the image was downloaded instead — look for it in your downloads.");
      return;
    }
    setSending(true);
    try {
      await shareFileOnly(file);
      setStatus(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("Share sheet closed — nothing was sent.");
      } else {
        triggerDownload(file, file.name);
        setStatus("Sharing didn't work, so the image was downloaded instead — look for it in your downloads.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
          Quote
        </h1>
        <p className="text-sm text-[var(--dim)] mt-1">
          Pick the cakes and sizes for this customer, set the prices, then
          share the quote as an image with your customer. Your
          picks and prices are saved.
        </p>
      </div>

      {/* Banner */}
      <section className={`${cardCls} mt-6 p-5`} aria-label="Banner">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-xl font-medium text-[#2c1e16]">
            Banner
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Sits at the top of the quote image
          </p>
        </div>
        {bannersQ.isPending ? (
          <Loading />
        ) : bannersQ.error ? (
          <div className="mt-3">
            <ErrorNote error={bannersQ.error} />
          </div>
        ) : (
          <>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {banners.map((b) => (
                <div key={b.id} className="relative shrink-0 pt-1 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!b.selected) selectBanner.mutate(b.id);
                    }}
                    aria-pressed={b.selected}
                    aria-label={
                      b.selected
                        ? `${b.name} banner — selected for the quote image`
                        : `Use the ${b.name} banner on the quote image`
                    }
                    className={`block w-48 overflow-hidden rounded-md text-left transition-shadow ${
                      b.selected
                        ? "ring-2 ring-[#ae8a3e] ring-offset-2 ring-offset-[var(--surface)]"
                        : "ring-1 ring-[var(--border)] hover:ring-[#ae8a3e]"
                    }`}
                  >
                    <BannerThumb url={b.url} name={b.name} />
                    <span className="flex items-center justify-between gap-2 bg-[var(--surface)] px-2 py-1.5">
                      <span className="truncate text-xs font-semibold text-[#2c1e16]">
                        {b.name}
                      </span>
                      {b.selected ? (
                        <span className="shrink-0 text-[11px] font-semibold text-[#8a6d2f]">
                          Selected
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#2c1e16] text-white shadow [&_svg]:w-3.5 [&_svg]:h-3.5"
                    onClick={() => deleteBanner.mutate(b.id)}
                    disabled={deleteBanner.isPending}
                    aria-label={`Delete the ${b.name} banner`}
                    title={`Delete the ${b.name} banner`}
                  >
                    <IconX />
                  </button>
                </div>
              ))}
              <label
                className={`flex aspect-auto w-32 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] text-[var(--dim)] transition-colors hover:border-[#ae8a3e] hover:text-[#8a6d2f] ${
                  addBanner.isPending ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <IconPlus />
                <span className="text-xs font-semibold">
                  {addBanner.isPending ? "Adding…" : "Add banner"}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Upload a new banner image"
                  onChange={onBannerFile}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--dim)]">
              {selectedBanner
                ? `The quote image opens with the ${selectedBanner.name} banner.`
                : "No banner selected — the quote image uses the Shadow Cakes logo header instead."}
              {selectedBanner ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-semibold text-[#8a6d2f] underline underline-offset-2"
                    onClick={() => selectBanner.mutate(null)}
                  >
                    Use no banner
                  </button>
                </>
              ) : null}
            </p>
          </>
        )}
      </section>

      {/* On this quote */}
      <section className={`${cardCls} mt-6 p-5`} aria-label="On this quote">
        <h2 className="font-heading text-xl font-medium text-[#2c1e16]">
          On this quote
        </h2>
        {quoteQ.isPending ? (
          <Loading />
        ) : quoteQ.error ? (
          <div className="mt-4">
            <ErrorNote error={quoteQ.error} />
          </div>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--dim)]">
            Nothing is selected yet — tick a size under Add items below and
            it will appear here with its price.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {items.map((item) => (
              <QuotePriceRow key={item.id} item={item} symbol={symbol} />
            ))}
          </ul>
        )}
      </section>

      {/* Add items */}
      <section className="mt-8" aria-label="Add items">
        <h2 className="font-heading text-xl font-medium text-[#2c1e16]">
          Add items
        </h2>
        <label className="mt-3 block max-w-md">
          <span className="sr-only">Search recipes and sizes</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search recipes or sizes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="mt-4">
          {recipesQ.isPending ? (
            <Loading />
          ) : recipesQ.error ? (
            <ErrorNote error={recipesQ.error} />
          ) : recipes.length === 0 ? (
            <EmptyState
              title="No recipes yet"
              body="Quotes are built from your recipes — add a recipe with its sizes first, then pick from it here."
            />
          ) : !query ? (
            <p className="text-sm text-[var(--dim)] py-1">
              Search to add items — type a recipe or size name, then tap a
              recipe to tick the sizes you want on this quote.
            </p>
          ) : searchMatches.length === 0 ? (
            <p className="text-sm text-[var(--dim)] py-3">
              Nothing matches “{search.trim()}” — try part of a recipe or
              size name.
            </p>
          ) : (
            <div className="grid gap-3">
              {searchMatches.map((m) => searchResult(m))}
            </div>
          )}
        </div>
      </section>

      {/* Footer text — the last section on the page, below Add items,
          mirroring where it sits at the foot of the quote image. */}
      <section className={`${cardCls} mt-8 p-5`} aria-label="Footer text">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-xl font-medium text-[#2c1e16]">
            Footer text
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Sits at the bottom of the quote image
          </p>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">
            Text at the bottom of the quote image
          </span>
          <textarea
            {...FIELDS.updateQuoteFooterText.text}
            className={`${inputCls} py-2`}
            rows={3}
            value={footerValue}
            onChange={(e) => setFooterDraft(e.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            disabled={!footerDirty || saveFooter.isPending}
            onClick={() => saveFooter.mutate(footerValue)}
          >
            {saveFooter.isPending ? "Saving…" : "Save footer text"}
          </button>
          {footerDirty ? (
            <span className="text-xs text-[var(--dim)]">
              Unsaved changes — the preview already uses what you've
              typed; save to keep it for next time.
            </span>
          ) : (
            <span className="text-xs text-[var(--dim)]">
              Saved — every quote image uses this text until you change it.
            </span>
          )}
        </div>
      </section>

      {/* Sticky action bar — always reachable, no scrolling to the end. */}
      <div className="sticky bottom-20 lg:bottom-4 z-30 mt-8">
        <div className="bg-[#2c1e16] text-white rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-sm flex-1 min-w-32">
            {items.length === 0
              ? "Nothing on this quote yet"
              : `${items.length} item${items.length === 1 ? "" : "s"} on this quote`}
          </span>
          <button
            type="button"
            onClick={() => {
              setStatus(null);
              setPreviewOpen(true);
            }}
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 bg-white text-[#2c1e16] hover:bg-[#f9ecd7] rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40"
            aria-label="Preview the quote image, then share it"
          >
            Preview
          </button>
        </div>
        {status ? (
          <p className="mt-2 text-sm text-[var(--dim)]" role="status">
            {status}
          </p>
        ) : null}
      </div>

      {/* Preview — the final step: the quote image with only its one
          action, Share. Close via the ×. */}
      {previewOpen ? (
        <Modal title="Your quote image" onClose={() => setPreviewOpen(false)}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Quote image: ${items
                .map((i) => `${i.recipe_name} ${i.variant_name}`)
                .join(", ")}`}
              className="w-full rounded-md border border-[var(--border)]"
            />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--dim)]">
              Preparing the image — it will appear here in a moment.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onShare()}
              disabled={sending || !prepared}
              className="inline-flex items-center gap-2 rounded-md bg-[#2c1e16] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3d2c20] disabled:opacity-40"
              aria-label="Share the quote image using your phone's share sheet"
            >
              <IconShare /> {sending ? "Opening…" : "Share"}
            </button>
          </div>
          {status ? (
            <p className="mt-3 text-sm text-[var(--dim)]" role="status">
              {status}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

// ---------- one picked item, with its editable quote price ----------

function QuotePriceRow({ item, symbol }: { item: QuoteItem; symbol: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState(() => String(item.price));
  const focused = useRef(false);

  // Keep the field in step with the saved price whenever she isn't
  // typing in it (e.g. after a save lands, or the row first renders).
  useEffect(() => {
    if (!focused.current) setText(String(item.price));
  }, [item.price]);

  const update = useMutation({
    mutationFn: (price: number) =>
      api.updateQuoteItemPrice({ id: item.id, price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote"] }),
    onError: (e) => toast(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.removeQuoteItem({ id: item.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote"] }),
    onError: (e) => toast(e.message, "error"),
  });

  const commit = () => {
    const parsed = parseFloat(text);
    if (text.trim() === "" || Number.isNaN(parsed) || parsed < 0) {
      setText(String(item.price));
      if (text.trim() !== "") {
        toast("Enter a price of $0 or more.", "error");
      }
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded !== item.price) update.mutate(rounded);
    setText(String(rounded));
  };

  return (
    <li className="py-3">
      {/* Stacked row: the name + variant get the full first line (long
          names no longer squeeze against the price field and break
          mid-variant), the remove × sits at the right end of that
          line, and the price field goes on the line underneath. */}
      <div className="flex items-start gap-3">
        <p className="flex-1 min-w-0 text-sm font-medium text-[#2c1e16] leading-snug">
          {item.recipe_name}{" "}
          <span className="text-[var(--dim)] font-normal">
            · {item.variant_name}
          </span>
        </p>
        <button
          type="button"
          className={`${btnIconSmall} shrink-0`}
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label={`Remove ${item.recipe_name} ${item.variant_name} from the quote`}
          title="Remove from quote"
        >
          <IconX />
        </button>
      </div>
      <label className="mt-2 flex items-center gap-1">
        <span className="text-sm text-[var(--dim)]" aria-hidden="true">
          {symbol}
        </span>
        <span className="sr-only">
          Quote price for {item.recipe_name} {item.variant_name}
        </span>
        <input
          {...FIELDS.updateQuoteItemPrice.price}
          type="number"
          inputMode="decimal"
          className={`${inputCls.replace("w-full", "w-24")} text-right font-mono`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`Quote price for ${item.recipe_name} ${item.variant_name}`}
        />
      </label>
    </li>
  );
}
