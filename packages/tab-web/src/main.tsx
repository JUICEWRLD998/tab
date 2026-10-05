import "@fontsource-variable/familjen-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// MotionConfig: reduced motion drops transform and layout animation and keeps opacity, so the signature moment becomes a crossfade that still states the result.
// LazyMotion with domMax: layout animations need it. Components use `m`, not `motion`, so strict mode catches a stray full import.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        <App />
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
);
