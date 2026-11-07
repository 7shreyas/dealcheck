import { redirect } from "next/navigation";

// The check now runs through POST /api/check and lives at /check/[id].
// Old /check?… links go back to the form.
export default function CheckIndex() {
  redirect("/#check");
}
