import diagramAsset from "@/assets/traffic-jam-diagram.png.asset.json";

export function TrafficJamDiagram({ className }: { className?: string }) {
  return (
    <img
      src={diagramAsset.url}
      alt="Traffic Jam setup diagram showing the player mat at the bottom, two obstacle mats with a centre gap, two jacks, an outer draw path curving around the left side to the front jack, and an inner draw path through the gap to the target jack."
      className={className}
    />
  );
}
