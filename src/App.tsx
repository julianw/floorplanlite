import { Sidebar } from './components/Sidebar/Sidebar';
import { FloorPlanCanvas } from './components/Canvas/FloorPlanCanvas';

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <FloorPlanCanvas />
      </main>
    </div>
  );
}
