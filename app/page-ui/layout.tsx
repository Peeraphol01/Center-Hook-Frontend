import { Suspense } from "react";
import Sidebar from "../components/sidebar";
import PreLoading from "../components/pre_loading";

/* -------------------------------------- Components -------------------------------------- */

// Function ครอบทุกหน้าใน page-ui
function PageUiLayout({ children }: LayoutProps<"/page-ui">) {
  return (
    <>
      <Sidebar />
      {/* เว้นที่ให้ top bar (mobile) และ sidebar (desktop) */}
      <main className="flex flex-1 flex-col pt-14 md:pt-0 md:pl-64">
        {/* แสดง PreLoading ระหว่างหน้ากำลังโหลด */}
        <Suspense fallback={<PreLoading />}>{children}</Suspense>
      </main>
    </>
  );
}

export default PageUiLayout
