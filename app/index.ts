import "./src/polyfills"; // must run before anything that imports mera/@noble
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
