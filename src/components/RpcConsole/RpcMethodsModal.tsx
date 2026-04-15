import { useState, useMemo } from "react";
import {
  Terminal,
  X,
  ChevronRight,
  Blocks,
  Wallet,
  Shield,
  ArrowRightLeft,
  Network,
  FileCode,
  Receipt,
  Gem,
  Bug,
  Settings,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RpcMethodInfo } from "@/types/rpc";

interface RpcMethodsModalProps {
  isOpen: boolean;
  onClose: () => void;
  methods: RpcMethodInfo[];
}

// Map category names to icons
const categoryIcons: Record<string, React.ReactNode> = {
  blockchain: <Blocks className="h-4 w-4" />,
  wallet: <Wallet className="h-4 w-4" />,
  validator: <Shield className="h-4 w-4" />,
  transaction: <ArrowRightLeft className="h-4 w-4" />,
  network: <Network className="h-4 w-4" />,
  contract: <FileCode className="h-4 w-4" />,
  receipt: <Receipt className="h-4 w-4" />,
  crystal: <Gem className="h-4 w-4" />,
  debug: <Bug className="h-4 w-4" />,
  init: <Settings className="h-4 w-4" />,
};

export function RpcMethodsModal({
  isOpen,
  onClose,
  methods,
}: RpcMethodsModalProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(
    new Set()
  );

  // Group methods by category
  const methodsByCategory = useMemo(() => {
    const grouped: Record<string, RpcMethodInfo[]> = {};
    for (const method of methods) {
      const category = method.category || "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(method);
    }
    // Sort categories alphabetically, but put "blockchain" first
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
      if (a === "blockchain") return -1;
      if (b === "blockchain") return 1;
      return a.localeCompare(b);
    });
    return sortedEntries;
  }, [methods]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleMethod = (methodName: string) => {
    setExpandedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(methodName)) {
        next.delete(methodName);
      } else {
        next.add(methodName);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <Card
        variant="crystalline"
        className="w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col relative overflow-hidden fade-in-up"
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 left-0 w-40 h-40 bg-gradient-to-br from-primary/50 to-transparent"
            style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
        </div>

        <CardHeader className="relative shrink-0 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="icon-hex bg-primary/20"
                style={{ width: "2.5rem", height: "2.5rem" }}
              >
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  RPC METHODS
                </CardTitle>
                <CardDescription>
                  {methods.length} methods available
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto flex-1 space-y-2 p-4">
          {methodsByCategory.map(([category, categoryMethods]) => {
            const isCategoryExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="space-y-1">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-2 p-2.5 chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-foreground-muted transition-transform duration-200",
                      isCategoryExpanded && "rotate-90"
                    )}
                  />
                  <span className="text-foreground-muted">
                    {categoryIcons[category] || (
                      <Terminal className="h-4 w-4" />
                    )}
                  </span>
                  <span className="font-heading text-sm tracking-wide uppercase">
                    {category}
                  </span>
                  <Badge
                    variant="outline"
                    shape="chamfered"
                    className="ml-auto text-[10px]"
                  >
                    {categoryMethods.length}
                  </Badge>
                </button>

                {/* Methods List */}
                {isCategoryExpanded && (
                  <div className="pl-4 space-y-1">
                    {categoryMethods.map((method) => {
                      const isMethodExpanded = expandedMethods.has(method.name);
                      const hasParams = method.params.length > 0;

                      return (
                        <div key={method.name}>
                          {/* Method Row */}
                          <button
                            type="button"
                            onClick={() =>
                              hasParams && toggleMethod(method.name)
                            }
                            className={cn(
                              "w-full text-left p-2 chamfered-sm transition-colors",
                              hasParams
                                ? "hover:bg-muted/30 cursor-pointer"
                                : "cursor-default"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {hasParams ? (
                                <ChevronRight
                                  className={cn(
                                    "h-3 w-3 text-foreground-muted transition-transform duration-200",
                                    isMethodExpanded && "rotate-90"
                                  )}
                                />
                              ) : (
                                <span className="w-3" />
                              )}
                              <code className="font-mono text-sm text-primary">
                                {method.name}
                              </code>
                              {method.requires_auth && (
                                <Badge
                                  variant="warning"
                                  shape="chamfered"
                                  className="text-[10px]"
                                  diamond
                                >
                                  AUTH
                                </Badge>
                              )}
                              {hasParams && (
                                <Badge
                                  variant="outline"
                                  shape="chamfered"
                                  className="text-[9px] opacity-60"
                                >
                                  {method.params.length} param
                                  {method.params.length !== 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-foreground-secondary mt-1 ml-5">
                              {method.description}
                            </p>
                          </button>

                          {/* Expanded Parameters */}
                          {isMethodExpanded && hasParams && (
                            <div className="ml-5 mt-1 mb-2 p-3 chamfered-sm bg-muted/20 space-y-2">
                              <div className="text-[10px] font-heading text-foreground-muted uppercase tracking-wider">
                                Parameters
                              </div>
                              {method.params.map((param) => (
                                <div
                                  key={param.name}
                                  className="flex flex-wrap items-start gap-2 text-xs"
                                >
                                  <code className="font-mono text-accent">
                                    {param.name}
                                  </code>
                                  <Badge
                                    variant="outline"
                                    shape="chamfered"
                                    className="text-[9px]"
                                  >
                                    {param.param_type}
                                  </Badge>
                                  <Badge
                                    variant={
                                      param.required
                                        ? "destructive"
                                        : "secondary"
                                    }
                                    shape="chamfered"
                                    className="text-[9px]"
                                  >
                                    {param.required ? "required" : "optional"}
                                  </Badge>
                                  {param.description && (
                                    <span className="text-foreground-muted basis-full mt-0.5">
                                      {param.description}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
