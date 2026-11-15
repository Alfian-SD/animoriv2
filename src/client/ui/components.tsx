import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center font-sans font-medium rounded-control transition-colors duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  }[size];

  const variantClasses = {
    primary: "bg-accent text-accent-ink hover:bg-[#bbf758] active:bg-[#90cc2f]",
    secondary: "bg-surface-2 text-text border border-line hover:border-text-3 hover:bg-[#28282e]",
    ghost: "bg-transparent text-text-2 hover:text-text hover:bg-surface-2",
    danger: "bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30",
  }[variant];

  return (
    <button className={`${base} ${sizeClasses} ${variantClasses} ${className}`} {...props}>
      {children}
    </button>
  );
};

interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({ label, selected = false, onClick, className = "" }) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-sans transition-colors duration-150 select-none border ${
        selected
          ? "bg-accent text-accent-ink font-semibold border-accent"
          : "bg-surface text-text-2 border-line hover:border-text-3 hover:text-text"
      } ${className}`}
    >
      {label}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = "",
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-line rounded-poster overflow-hidden ${
        onClick ? "cursor-pointer hover:border-text-3 transition-colors duration-150" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
};
