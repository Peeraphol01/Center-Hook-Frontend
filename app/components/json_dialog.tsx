"use client";

import { useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { HiOutlineCheck, HiOutlineClipboardCopy, HiX } from "react-icons/hi";

/* -------------------------------------- Components -------------------------------------- */

// Function popup แสดง JSON (value = null คือปิด) พร้อมปุ่มคัดลอก
function JsonDialog({ value, onClose }: { value: { json: unknown } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = value ? JSON.stringify(value.json, null, 2) : "";

  // คัดลอก JSON แล้วแสดง "Copied" 1.5 วินาที
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={value !== null} onClose={onClose} className="relative z-60">
      <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
            <DialogTitle className="font-semibold text-zinc-900 dark:text-white">JSON</DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copy}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {copied ? <HiOutlineCheck className="h-4 w-4 text-green-600" /> : <HiOutlineClipboardCopy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                <HiX className="h-5 w-5" />
              </button>
            </div>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{text}</pre>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default JsonDialog;
