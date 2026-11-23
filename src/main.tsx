import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrap } from "./app/bootstrap";
import "./styles/global.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
bootstrap()
  .then(({ store, engine }) =>
    root.render(
      <React.StrictMode>
        <App store={store} engine={engine} />
      </React.StrictMode>,
    ),
  )
  .catch((e: unknown) =>
    root.render(<p className="startup-error">TaskRows could not start: {e instanceof Error ? e.message : String(e)}</p>),
  );
