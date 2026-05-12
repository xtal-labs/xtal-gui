import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Whether pagination is in loading state */
  isLoading?: boolean;
  /** Optional className for the container */
  className?: string;
}

/**
 * Generate array of page numbers to display
 * Always shows first page, last page, and up to 5 pages around current
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];

  // Always include page 1
  pages.push(1);

  // Calculate the range around current page
  let rangeStart = Math.max(2, currentPage - 2);
  let rangeEnd = Math.min(totalPages - 1, currentPage + 2);

  // Adjust range to always show 5 numbers when possible
  if (rangeEnd - rangeStart < 4) {
    if (currentPage < totalPages / 2) {
      rangeEnd = Math.min(totalPages - 1, rangeStart + 4);
    } else {
      rangeStart = Math.max(2, rangeEnd - 4);
    }
  }

  // Add ellipsis before range if needed
  if (rangeStart > 2) {
    pages.push("ellipsis");
  }

  // Add pages in range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // Add ellipsis after range if needed
  if (rangeEnd < totalPages - 1) {
    pages.push("ellipsis");
  }

  // Always include last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Crystalline-themed pagination component
 *
 * Visual layout:
 * [<] [1] [...] [4] [5] [6] [...] [12] [>]
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  className,
}: PaginationProps) {
  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const handlePageChange = (page: number) => {
    if (page !== currentPage && page >= 1 && page <= totalPages && !isLoading) {
      onPageChange(page);
    }
  };

  // Base styles for all buttons
  const buttonBase = cn(
    "h-8 transition-all duration-200",
    "chamfered-sm border border-border/50",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    isLoading && "pointer-events-none opacity-60"
  );

  // Arrow button styles
  const arrowButton = cn(
    buttonBase,
    "w-8 flex items-center justify-center",
    "bg-muted/50 text-foreground-secondary",
    "hover:bg-muted hover:text-foreground"
  );

  // Page number button styles
  const pageButton = cn(
    buttonBase,
    "min-w-8 px-2 font-mono tabular-nums text-sm"
  );

  // Active page styles (crystalline glow)
  const pageButtonActive = cn(
    pageButton,
    "bg-primary text-primary-foreground",
    "shadow-[0_0_10px_hsl(var(--glow-color))]"
  );

  // Inactive page styles
  const pageButtonInactive = cn(
    pageButton,
    "bg-muted/50 text-foreground-secondary",
    "hover:bg-muted hover:text-foreground"
  );

  return (
    <nav
      className={cn("flex items-center justify-center gap-1 py-3", className)}
      aria-label="Pagination"
    >
      {/* Previous button */}
      <button
        type="button"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
        className={arrowButton}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Page numbers */}
      {pageNumbers.map((page, index) => {
        if (page === "ellipsis") {
          return (
            <span
              key={`ellipsis-${index}`}
              className="h-8 px-1 text-foreground-muted flex items-center text-sm"
              aria-hidden="true"
            >
              ...
            </span>
          );
        }

        const isActive = page === currentPage;
        return (
          <button
            type="button"
            key={page}
            onClick={() => handlePageChange(page)}
            disabled={isLoading}
            className={isActive ? pageButtonActive : pageButtonInactive}
            aria-label={`Page ${page}`}
            aria-current={isActive ? "page" : undefined}
          >
            {page}
          </button>
        );
      })}

      {/* Next button */}
      <button
        type="button"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isLoading}
        className={arrowButton}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export default Pagination;
