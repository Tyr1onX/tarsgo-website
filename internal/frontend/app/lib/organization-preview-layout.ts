import { ORGANIZATION_PREVIEW, type OrganizationCategory } from "../data/organization-preview.ts";

export interface OrganizationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrganizationPositionLayout extends OrganizationBox {
  id: string;
}

export interface OrganizationCategoryLayout extends OrganizationBox {
  id: string;
  headerHeight: number;
  positions: OrganizationPositionLayout[];
}

export interface OrganizationPreviewLayout {
  width: number;
  height: number;
  columns: number;
  team: OrganizationBox;
  leader: OrganizationBox;
  leaderConnector: string;
  categories: OrganizationCategoryLayout[];
}

const TEAM_WIDTH = 330;
const TEAM_HEIGHT = 58;
const LEADER_WIDTH = 292;
const LEADER_HEIGHT = 72;
const TEAM_TOP = 18;
const LEADER_TOP = 112;
const CATEGORY_TOP = 254;
const CATEGORY_HEADER_HEIGHT = 50;
const POSITION_HEIGHT = 72;
const POSITION_GAP = 10;
const CATEGORY_BOTTOM_PADDING = 12;
const CATEGORY_GAP = 16;
const WIDE_MARGIN = 24;
const MOBILE_MARGIN = 14;

function categoryHeight(category: OrganizationCategory, isExpanded: boolean) {
  if (!isExpanded) return CATEGORY_HEADER_HEIGHT;
  return CATEGORY_HEADER_HEIGHT
    + 12
    + category.positions.length * POSITION_HEIGHT
    + Math.max(0, category.positions.length - 1) * POSITION_GAP
    + CATEGORY_BOTTOM_PADDING;
}

/**
 * Place category cards in responsive rows. Each row takes the height of its
 * tallest expanded category, so expanding a group moves later rows instead of
 * letting nodes overlap.
 */
export function layoutOrganizationPreview(viewportWidth: number, expandedCategoryIDs: ReadonlySet<string>): OrganizationPreviewLayout {
  const width = Math.max(320, Math.floor(viewportWidth));
  const columns = width < 760 ? 1 : width < 960 ? 2 : width < 1120 ? 3 : 4;
  const margin = columns === 1 ? MOBILE_MARGIN : WIDE_MARGIN;
  const gap = columns === 1 ? 14 : 16;
  const categoryWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const categories = ORGANIZATION_PREVIEW.categories;
  const panels = categories.map((category, index) => ({
    category,
    index,
    height: categoryHeight(category, expandedCategoryIDs.has(category.id)),
  }));
  const rowCount = Math.ceil(panels.length / columns);
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) => Math.max(
    0,
    ...panels.slice(rowIndex * columns, (rowIndex + 1) * columns).map(({ height }) => height),
  ));
  const rowTops: number[] = [];
  let nextRowTop = CATEGORY_TOP;
  for (const height of rowHeights) {
    rowTops.push(nextRowTop);
    nextRowTop += height + CATEGORY_GAP;
  }

  const categoryLayouts = panels.map(({ category, index, height }) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = margin + column * (categoryWidth + gap);
    const y = rowTops[row];
    const isExpanded = expandedCategoryIDs.has(category.id);
    return {
      id: category.id,
      x,
      y,
      width: categoryWidth,
      height,
      headerHeight: CATEGORY_HEADER_HEIGHT,
      positions: isExpanded
        ? category.positions.map((position, positionIndex) => ({
          id: position.id,
          x: x + 18,
          y: y + CATEGORY_HEADER_HEIGHT + 12 + positionIndex * (POSITION_HEIGHT + POSITION_GAP),
          width: categoryWidth - 30,
          height: POSITION_HEIGHT,
        }))
        : [],
    };
  });

  const team = { x: (width - TEAM_WIDTH) / 2, y: TEAM_TOP, width: TEAM_WIDTH, height: TEAM_HEIGHT };
  const leader = { x: (width - LEADER_WIDTH) / 2, y: LEADER_TOP, width: LEADER_WIDTH, height: LEADER_HEIGHT };
  const centerX = width / 2;
  const height = Math.max(220, nextRowTop - CATEGORY_GAP + 24);

  return {
    width,
    height,
    columns,
    team,
    leader,
    leaderConnector: `M ${centerX} ${team.y + team.height} V ${leader.y}`,
    categories: categoryLayouts,
  };
}
