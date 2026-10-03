import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpaceflightAcademyV2 from "./SpaceflightAcademyV2";
import "./styles.css";
import "./flight.css";
import "./spaceflight-v2.css";
createRoot(document.getElementById("root")!).render(<StrictMode><SpaceflightAcademyV2 /></StrictMode>);
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>undefined));
