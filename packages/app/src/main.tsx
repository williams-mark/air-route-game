import React from "react";
import { createRoot } from "react-dom/client";
import { newWorld } from "@arg/sim";
import { airports } from "@arg/data";
import "./theme.css";

function App() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const world = newWorld(1);
  return (
    <div className="panel" style={{ margin: 24 }}>
      <h1>Air Route Game</h1>
      <p>Day {world.day}. {airports.length} airports loaded.</p>
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Toggle theme ({theme})</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
