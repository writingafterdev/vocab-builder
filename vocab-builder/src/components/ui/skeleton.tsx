import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-neutral-200 dark:bg-neutral-800 animate-shimmer bg-[linear-gradient(90deg,theme(colors.neutral.200),theme(colors.white),theme(colors.neutral.200))] dark:bg-[linear-gradient(90deg,theme(colors.neutral.800),theme(colors.neutral.700),theme(colors.neutral.800))] bg-[length:200%_100%] rounded-md",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
