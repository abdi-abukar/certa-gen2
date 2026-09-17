/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOOK,
  WALKER_BACKGROUNDS,
  WALKER_HAIR_COLORS,
  WALKER_OUTFIT_COLORS,
  WALKER_SKIN_TONES,
  lookKey,
  normalizeLook,
} from "../character-look";
import "./customize-studio.css";

const LOCKED_HAIR = "#d4b06b";

const PREMADES = [
  {
    id: "a",
    look: {
      ...DEFAULT_LOOK,
      hair: "short",
      top: "tee",
      hat: "none",
      glasses: "none",
      facialHair: "none",
    },
  },
  {
    id: "b",
    look: {
      ...DEFAULT_LOOK,
      hair: "short",
      top: "tee",
      hat: "cap",
      glasses: "none",
      facialHair: "none",
    },
  },
  {
    id: "e",
    look: {
      ...DEFAULT_LOOK,
      hair: "bun",
      top: "tee",
      hat: "none",
      glasses: "none",
      facialHair: "none",
    },
  },
  {
    id: "f",
    look: {
      ...DEFAULT_LOOK,
      hair: "long",
      top: "hoodie",
      hat: "none",
      glasses: "none",
      facialHair: "none",
    },
  },
  {
    id: "g",
    look: {
      ...DEFAULT_LOOK,
      hair: "ponytail",
      top: "tee",
      hat: "none",
      glasses: "none",
      facialHair: "none",
    },
  },
];

function silhouetteKey(look) {
  return [look.hair, look.hat, look.top, look.glasses, look.facialHair].join(
    "|",
  );
}

function matchPremade(look) {
  const key = silhouetteKey(look);
  return PREMADES.find((entry) => silhouetteKey(entry.look) === key) ?? null;
}

export default function CustomizeStudio({
  initialLook = DEFAULT_LOOK,
  earned = [],
  onLookChange,
}) {
  const [look, setLook] = useState(() => normalizeLook(initialLook));
  const [status, setStatus] = useState("");
  const earnedSet = useMemo(() => new Set(earned), [earned]);
  const goldUnlocked = earnedSet.has("crown");
  const selected = matchPremade(look);

  useEffect(() => {
    onLookChange?.(look);
    window.parent?.postMessage({ type: "certa:look-change", look }, window.location.origin);
    const timer = window.setTimeout(() => {
      window.parent?.postMessage({ type: "certa:look-save", look }, window.location.origin);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [look, onLookChange]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === "set-character" && event.data.look) {
        setLook(normalizeLook(event.data.look));
      }
      if (event.data?.type === "certa:look-saved") setStatus("Saved.");
      if (event.data?.type === "certa:look-error") {
        setStatus(
          typeof event.data.message === "string"
            ? event.data.message
            : "Could not save.",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const patch = (partial) => {
    setStatus("");
    setLook((current) => normalizeLook({ ...current, ...partial }));
  };

  const pickPremade = (premade) => {
    setStatus("");
    setLook((current) =>
      normalizeLook({
        ...premade.look,
        skinTone: current.skinTone,
        hairColor: current.hairColor,
        outfitColor: current.outfitColor,
        background: current.background,
      }),
    );
  };

  const pickHairColor = (color) => {
    if (color === LOCKED_HAIR && !goldUnlocked) {
      setStatus("Earn the Crown payout to unlock this hair.");
      return;
    }
    patch({ hairColor: color });
  };

  return (
    <div className="customize-studio">
      <div className="customize-studio__panel">
        <div className="customize-studio__row">
          {PREMADES.map((premade) => (
            <Choice
              key={premade.id}
              selected={selected?.id === premade.id}
              onClick={() => pickPremade(premade)}
              label={`Character ${premade.id}`}
            >
              <span
                className="customize-studio__sprite"
                style={{
                  backgroundImage: `url(./premade/${premade.id}.png)`,
                }}
              />
            </Choice>
          ))}
        </div>

        <div className="customize-studio__swatches">
          {WALKER_SKIN_TONES.map((color) => (
            <Swatch
              key={color}
              color={color}
              selected={look.skinTone === color}
              onClick={() => patch({ skinTone: color })}
              label={`Skin ${color}`}
            />
          ))}
        </div>
        <div className="customize-studio__swatches">
          {WALKER_HAIR_COLORS.map((color) => (
            <Swatch
              key={color}
              color={color}
              selected={look.hairColor === color}
              locked={color === LOCKED_HAIR && !goldUnlocked}
              onClick={() => pickHairColor(color)}
              label={`Hair ${color}`}
            />
          ))}
        </div>
        <div className="customize-studio__swatches">
          {WALKER_OUTFIT_COLORS.map((color) => (
            <Swatch
              key={color}
              color={color}
              selected={look.outfitColor === color}
              onClick={() => patch({ outfitColor: color })}
              label={`Top ${color}`}
            />
          ))}
        </div>
        <div className="customize-studio__swatches">
          {WALKER_BACKGROUNDS.map((value) => (
            <Swatch
              key={value}
              color={
                value === "canopy"
                  ? "#0f2a1c"
                  : value === "gold"
                    ? "#33270f"
                    : value === "ember"
                      ? "#361410"
                      : value === "ocean"
                        ? "#0d2133"
                        : value === "violet"
                          ? "#231340"
                          : value === "graphite"
                            ? "#232629"
                            : value === "rose"
                              ? "#33121f"
                              : "#10303a"
              }
              selected={look.background === value}
              onClick={() => patch({ background: value })}
              label={value}
            />
          ))}
        </div>

        {status ? <p className="customize-studio__status">{status}</p> : null}
      </div>
      <span className="sr-only">{lookKey(look)}</span>
    </div>
  );
}

function Choice({ selected, onClick, children, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      className={["customize-studio__choice", selected ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Swatch({ color, selected, locked, onClick, label }) {
  return (
    <button
      type="button"
      className={[
        "customize-studio__swatch",
        selected ? "is-selected" : "",
        locked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--swatch": color }}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    />
  );
}
