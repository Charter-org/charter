import { recentDecisions } from "../lib/mandate";
const d = await recentDecisions(8);
console.log("decisions (newest first):", d.length);
for (const x of d) console.log(` #${x.seq} ${x.action}${x.acted ? "" : " (abstained)"} ${x.acted ? x.leverageX.toFixed(2)+"x/"+x.slippagePct+"%" : "— "+x.reason}`);
