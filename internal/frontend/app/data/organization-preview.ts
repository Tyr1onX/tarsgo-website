export type OrganizationPosition = {
  id: string;
  title: string;
  name: string;
};

export type OrganizationCategory = {
  id: string;
  title: string;
  positions: OrganizationPosition[];
};

export type OrganizationPreview = {
  team: { id: string; title: string };
  leader: OrganizationPosition;
  categories: OrganizationCategory[];
};
