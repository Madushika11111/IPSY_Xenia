export interface PersonalizationTestData {
  channel: string;
  rulesetTemplate: string;
  ruleTemplate: string;
  controlEntry: string;
  variantEntry: string;
  variantTraffic: number;
}

export interface ContentPersonalizationTestData {
  fixtureEntry: string;
  variantEntry: string;
  channel: string;
  secondChannel: string;
  ruleTemplate: string;
  ruleName: string;
}
