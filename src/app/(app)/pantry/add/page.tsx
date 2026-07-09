import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GroceryScan from "../GroceryScan";
import InvoiceImport from "../InvoiceImport";
import ListImport from "../ListImport";
import PantryForm from "../PantryForm";
import { hasApiKey } from "@/lib/queries";

// Every way to add to the pantry, on its own screen. The list of items the user
// already has lives on /pantry — this page is purely the input methods.
export default async function AddToPantryPage() {
  const connected = await hasApiKey();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/pantry"
          aria-label="Back to pantry"
          className="text-[var(--muted)] transition active:scale-90"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-3xl font-semibold">Add to pantry</h1>
      </div>

      <PantryForm />
      <ListImport />
      <InvoiceImport />
      <GroceryScan connected={connected} />
    </main>
  );
}
