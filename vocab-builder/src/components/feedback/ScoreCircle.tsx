'use client';

/**
 * ScoreCircle - Circular score display
 * Shows overall score with solid teal color
 */

interface ScoreCircleProps {
    score: number; // 0-100
    size?: 'sm' | 'md' | 'lg' | 'xl';
    label?: string;
}

export function ScoreCircle({ score, size = 'md', label }: ScoreCircleProps) {
    const sizeClasses = {
        sm: 'w-16 h-16 text-xl',
        md: 'w-24 h-24 text-3xl',
        lg: 'w-32 h-32 text-4xl',
        xl: 'w-40 h-40 text-5xl'
    };

    const circumference = 2 * Math.PI * 45;
    const progress = (score / 100) * circumference;
    const strokeDashoffset = circumference - progress;

    // Color based on score
    const getColor = () => {
        if (score >= 80) return '#0d9488'; // teal-600
        if (score >= 60) return '#f59e0b'; // amber-500
        return '#ef4444'; // red-500
    };

    return (
        <div className="flex flex-col items-center">
            <div className={`relative ${sizeClasses[size]} flex items-center justify-center`}>
                {/* Background circle */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                        cx="50%"
                        cy="50%"
                        r="45%"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="8"
                    />
                    <circle
                        cx="50%"
                        cy="50%"
                        r="45%"
                        fill="none"
                        stroke={getColor()}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-500"
                    />
                </svg>

                {/* Score number */}
                <span
                    className="font-bold"
                    style={{ color: getColor() }}
                >
                    {score}
                </span>
            </div>

            {label && (
                <span className="mt-2 text-sm text-slate-500">{label}</span>
            )}
        </div>
    );
}
