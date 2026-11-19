// A layout template is data (design "4. Layout engine").
export type LayoutTemplate = {
  id: string;
  stage: { width: 1600; height: 1200 };
  slots: Array<{
    id: string;
    accepts: "character" | "prop" | "scenery";
    footX: number;
    footY: number;
    height: number;
    minScale: number;
    z: number;
    // The only poses this slot accepts. A pose that some slot lists is
    // reserved for slots that list it (implementation decision R35).
    poses?: string[];
  }>;
};
