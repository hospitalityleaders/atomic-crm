import {
  DragDropContext,
  Droppable,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import isEqual from "lodash/isEqual";
import { Trash2 } from "lucide-react";
import {
  useDataProvider,
  useGetList,
  useListContext,
  type DataProvider,
} from "ra-core";
import { useEffect, useState } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { DealColumn } from "./DealColumn";
import type { DealsByStage } from "./stages";
import { getDealsByStage } from "./stages";

const LIVE_PREFIX = "live:";
const ARCHIVE_PREFIX = "archive:";
const ARCHIVE_BIN = "archive-bin";

export const DealListContent = () => {
  const { dealStages } = useConfigurationContext();
  const { data: unorderedDeals, isPending, refetch } = useListContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const archivedQuery = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "archived_position", order: "ASC" },
    filter: { "archived_at@not.is": null },
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [dealsByStage, setDealsByStage] = useState<DealsByStage>(
    getDealsByStage([], dealStages),
  );

  useEffect(() => {
    if (unorderedDeals) {
      const next = getDealsByStage(unorderedDeals, dealStages);
      if (!isEqual(next, dealsByStage)) setDealsByStage(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unorderedDeals, dealStages]);

  if (isPending) return null;

  const archivedDeals = (archivedQuery.data ?? []).map((deal) => ({
    ...deal,
    stage: deal.archived_stage_id || deal.stage,
    index: Number(deal.archived_position ?? deal.index),
  }));
  const archivedByStage = getDealsByStage(archivedDeals, dealStages);

  const refreshBoards = async () => {
    await Promise.all([refetch(), archivedQuery.refetch()]);
  };

  const onDragEnd: OnDragEndResponder = async ({ destination, source }) => {
    if (!destination) return;
    const sourceIsArchived = source.droppableId.startsWith(ARCHIVE_PREFIX);
    const sourceStage = source.droppableId.replace(
      sourceIsArchived ? ARCHIVE_PREFIX : LIVE_PREFIX,
      "",
    );
    const sourceDeal = (sourceIsArchived ? archivedByStage : dealsByStage)[
      sourceStage
    ]?.[source.index];
    if (!sourceDeal) return;

    if (!sourceIsArchived && destination.droppableId === ARCHIVE_BIN) {
      await dataProvider.archiveDeal!(sourceDeal);
      setArchiveOpen(true);
      await refreshBoards();
      return;
    }

    if (sourceIsArchived && destination.droppableId.startsWith(LIVE_PREFIX)) {
      await dataProvider.unarchiveDeal(sourceDeal);
      await refreshBoards();
      return;
    }

    if (sourceIsArchived || !destination.droppableId.startsWith(LIVE_PREFIX))
      return;
    const destinationStage = destination.droppableId.slice(LIVE_PREFIX.length);
    if (destinationStage === sourceStage && destination.index === source.index)
      return;
    const destinationDeal = dealsByStage[destinationStage]?.[
      destination.index
    ] ?? {
      stage: destinationStage,
      index: undefined,
    };
    setDealsByStage(
      updateDealStageLocal(
        sourceDeal,
        { stage: sourceStage, index: source.index },
        { stage: destinationStage, index: destination.index },
        dealsByStage,
      ),
    );
    await updateDealStage(sourceDeal, destinationDeal, dataProvider);
    await refetch();
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {dealStages.map((stage) => (
          <DealColumn
            key={stage.value}
            stage={stage.value}
            deals={dealsByStage[stage.value] ?? []}
            droppableId={`${LIVE_PREFIX}${stage.value}`}
          />
        ))}
      </div>

      <Droppable droppableId={ARCHIVE_BIN}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`relative my-8 flex h-6 w-full items-center bg-[#fd3732] px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors ${
              snapshot.isDraggingOver
                ? "brightness-110 ring-4 ring-[#fd3732]/20"
                : "hover:brightness-95"
            }`}
          >
            <span>
              Deal bin <span className="ml-1">{archivedQuery.total ?? 0}</span>
            </span>
            <button
              type="button"
              onClick={() => setArchiveOpen((open) => !open)}
              className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-background bg-[#fd3732] text-white shadow-sm transition hover:scale-105 hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fd3732] focus-visible:ring-offset-2"
              aria-expanded={archiveOpen}
              aria-controls="archived-deals-board"
              aria-label={
                archiveOpen ? "Hide archived deals" : "Show archived deals"
              }
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <span className="sr-only">
              Drop a deal here to archive it. Select the bin to show or hide
              archived deals.
            </span>
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {archiveOpen ? (
        <section
          id="archived-deals-board"
          className="mt-2"
          aria-label="Archived deals"
        >
          <p className="sr-only">
            Drag an archived deal back to the live board to restore its prior
            stage and position.
          </p>
          <div className="flex gap-4 overflow-x-auto opacity-90">
            {dealStages.map((stage) => (
              <DealColumn
                key={stage.value}
                stage={stage.value}
                deals={archivedByStage[stage.value] ?? []}
                droppableId={`${ARCHIVE_PREFIX}${stage.value}`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </DragDropContext>
  );
};

const updateDealStageLocal = (
  sourceDeal: Deal,
  source: { stage: string; index: number },
  destination: { stage: string; index?: number },
  state: DealsByStage,
) => {
  const next = Object.fromEntries(
    Object.entries(state).map(([key, deals]) => [key, [...deals]]),
  ) as DealsByStage;
  next[source.stage].splice(source.index, 1);
  next[destination.stage].splice(
    destination.index ?? next[destination.stage].length,
    0,
    sourceDeal,
  );
  return next;
};

const updateDealStage = async (
  source: Deal,
  destination: { stage: string; index?: number },
  dataProvider: DataProvider,
) => {
  const liveFilter = (stage: string) => ({ stage, "archived_at@is": null });
  if (source.stage === destination.stage) {
    const { data: columnDeals } = await dataProvider.getList<Deal>("deals", {
      sort: { field: "index", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
      filter: liveFilter(source.stage),
    });
    const destinationIndex = destination.index ?? columnDeals.length;
    const ordered = columnDeals.filter((deal) => deal.id !== source.id);
    ordered.splice(destinationIndex, 0, source);
    await Promise.all(
      ordered.map((deal, index) =>
        dataProvider.update("deals", {
          id: deal.id,
          data: { index },
          previousData: deal,
        }),
      ),
    );
    return;
  }
  const { data: destinationDeals } = await dataProvider.getList<Deal>("deals", {
    sort: { field: "index", order: "ASC" },
    pagination: { page: 1, perPage: 1000 },
    filter: liveFilter(destination.stage),
  });
  const destinationIndex = destination.index ?? destinationDeals.length;
  await Promise.all([
    ...destinationDeals
      .filter((deal) => deal.index >= destinationIndex)
      .map((deal) =>
        dataProvider.update("deals", {
          id: deal.id,
          data: { index: deal.index + 1 },
          previousData: deal,
        }),
      ),
    dataProvider.update("deals", {
      id: source.id,
      data: { stage: destination.stage, index: destinationIndex },
      previousData: source,
    }),
  ]);
};
