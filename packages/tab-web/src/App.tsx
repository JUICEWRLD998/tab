import { Component, Suspense, lazy, useEffect, useMemo, type ErrorInfo, type ReactNode } from "react";
import { Shell } from "./components/Shell";
import { Notice, LinkButton } from "./components/ui";
import { parseRoute, useHash, href, type Route } from "./lib/router";
import { wireWalletEvents } from "./lib/wallet";
import { Home } from "./screens/Home";

// Screens that read the chain load on demand, so the landing page does not pay for viem and the ledger code.
const Group = lazy(() => import("./screens/Group").then((m) => ({ default: m.Group })));
const NewGroup = lazy(() => import("./screens/NewGroup").then((m) => ({ default: m.NewGroup })));
const Settle = lazy(() => import("./screens/Settle").then((m) => ({ default: m.Settle })));
const Verify = lazy(() => import("./screens/Verify").then((m) => ({ default: m.Verify })));

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "grid", gap: "var(--s4)", maxWidth: 560 }}>
        <Notice tone="error" title="Something broke on this page">
          {this.state.error.message}
        </Notice>
        <div>
          <LinkButton variant="secondary" href={href.home()}>
            Back to start
          </LinkButton>
        </div>
      </div>
    );
  }
}

const TITLES: Record<Route["name"], string> = {
  home: "Tab: settle a group in one signature",
  new: "Start a group · Tab",
  group: "Group · Tab",
  settle: "Settle up · Tab",
  verify: "Verify · Tab",
  notfound: "Not found · Tab",
};

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <Home />;
    case "new":
      return <NewGroup />;
    case "group":
      return <Group key={route.id} id={route.id} from={route.from} />;
    case "settle":
      return <Settle key={route.id} id={route.id} from={route.from} />;
    case "verify":
      return <Verify hash={route.hash} from={route.from} />;
    case "notfound":
      return (
        <div style={{ display: "grid", gap: "var(--s4)", maxWidth: 560 }}>
          <h1>Nothing here</h1>
          <p>There is no page at {route.path}.</p>
          <div>
            <LinkButton variant="secondary" href={href.home()}>
              Back to start
            </LinkButton>
          </div>
        </div>
      );
  }
}

export function App() {
  const hash = useHash();
  const route = useMemo<Route>(() => parseRoute(hash), [hash]);

  useEffect(() => wireWalletEvents(), []);
  useEffect(() => {
    document.title = TITLES[route.name];
    window.scrollTo(0, 0);
    // Move focus to the page so keyboard and screen-reader users start at the new screen, not the old link.
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [hash, route.name]);

  return (
    <Shell route={route}>
      <Boundary resetKey={hash}>
        <Suspense fallback={<p role="status" className="sr-only">Loading</p>}>
          <Screen route={route} />
        </Suspense>
      </Boundary>
    </Shell>
  );
}
