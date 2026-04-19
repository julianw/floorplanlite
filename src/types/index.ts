export interface Opening {
  id: string;
  type: 'door' | 'window';
  edge: 'top' | 'right' | 'bottom' | 'left';
  offset: number; // feet from the near corner along the edge
  w: number;      // feet (width of the opening)
}

export interface Room {
  id: string;
  label: string;
  floor: string;
  x: number;            // feet (top-left origin)
  y: number;            // feet
  w: number;            // feet (width, grows right)
  h: number;            // feet (height, grows down)
  color: string;
  isCutter: boolean;
  targetParent: string | null; // id of the room this cutter subtracts from
  openings: Opening[];
}

export interface CanvasSettings {
  gridSnap: number; // feet — default 0.5
  unit: 'ft';
  ppf: number;      // pixels per foot — default 40
  floors: string[];
}

export interface UiState {
  selectedIds: string[];
  showNetArea: boolean;
  activeFloor: string;
  placingOpening: 'door' | 'window' | null; // transient — not persisted
}

export interface AppState {
  version: string;
  meta: {
    projectTitle: string;
    createdAt: string;
    updatedAt: string;
  };
  canvas: CanvasSettings;
  rooms: Room[];
  uiState: UiState;
}
