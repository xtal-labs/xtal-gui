/**
 * Shared pagination primitives for transaction history surfaces.
 *
 * The Wallet (UTXO + VM) and Validator panels all page through
 * `get_transaction_history` / `get_vm_transaction_history`, which take a
 * `limit`/`offset` pair and return the *full* history length as `totalCount`.
 * Keeping the page size in one place stops those surfaces from drifting apart.
 *
 * Note: the block explorer uses its own smaller page size and does not share
 * these helpers.
 */

/** Transactions requested per page. */
export const PAGE_SIZE = 50;

/** Clamp a possibly-undefined page number to a valid 1-indexed page. */
export const normalizePage = (page: number | undefined) => Math.max(1, page ?? 1);

/** Convert a 1-indexed page number to the backend `offset` argument. */
export const getPageOffset = (page: number) => (page - 1) * PAGE_SIZE;

/** Pagination state tracked per transaction surface in the Zustand stores. */
export interface TransactionPagination {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  isLoading: boolean;
}

/** Initial pagination state for a transaction surface. */
export const initialTransactionPagination: TransactionPagination = {
  currentPage: 1,
  totalCount: 0,
  pageSize: PAGE_SIZE,
  isLoading: false,
};
