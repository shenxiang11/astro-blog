import FuzzyText from "@/components/FuzzyText";

type NotFoundTitleProps = {
  message: string;
};

export default function NotFoundTitle({ message }: NotFoundTitleProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-accent">
        <FuzzyText
          baseIntensity={0.2}
          hoverIntensity={0.5}
          enableHover
          fontSize="clamp(4.5rem, 18vw, 9rem)"
          fontWeight={900}
          color="currentColor"
        >
          404
        </FuzzyText>
      </div>
      <div className="text-foreground">
        <FuzzyText
          baseIntensity={0.22}
          hoverIntensity={0.5}
          enableHover
          fontSize="clamp(1.25rem, 3.5vw, 1.75rem)"
          fontWeight={400}
          fuzzRange={22}
          color="currentColor"
        >
          {"¯\\_(ツ)_/¯"}
        </FuzzyText>
      </div>
      <div className="text-foreground mt-4">
        <FuzzyText
          baseIntensity={0.22}
          hoverIntensity={0.5}
          enableHover
          fontSize="clamp(1.5rem, 4vw, 1.875rem)"
          fontWeight={400}
          fuzzRange={24}
          color="currentColor"
        >
          {message}
        </FuzzyText>
      </div>
    </div>
  );
}
