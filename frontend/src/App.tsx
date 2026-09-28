import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";
import { ToastProvider } from "./components/Toast";
import { DashboardPage } from "./pages/DashboardPage";
import { PipelinePage } from "./pages/PipelinePage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailsPage } from "./pages/JobDetailsPage";
import { DeadLettersPage } from "./pages/DeadLettersPage";
import { DeadLetterDetailsPage } from "./pages/DeadLetterDetailsPage";
import { CreateJobPage } from "./pages/CreateJobPage";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:id" element={<JobDetailsPage />} />
            <Route path="/dead-letters" element={<DeadLettersPage />} />
            <Route path="/dead-letters/:id" element={<DeadLetterDetailsPage />} />
            <Route path="/create" element={<CreateJobPage />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </ToastProvider>
  );
}
