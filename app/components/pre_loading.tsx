import { CgSpinner } from "react-icons/cg";

/* -------------------------------------- Components -------------------------------------- */

// Function แสดง spinner ระหว่าง Loading
function PreLoading() {

  /* -------------------------------------- UI -------------------------------------- */

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-zinc-500 dark:text-zinc-400"
    >
      {/* Spinner — motion-reduce ช้าลงสำหรับคนที่ปิด animation */}
      <CgSpinner className="h-10 w-10 animate-spin text-red-600 motion-reduce:animate-[spin_1.5s_linear_infinite] dark:text-red-400" />
      <span className="text-sm font-medium">Loading...</span>
    </div>
  );
}

export default PreLoading
