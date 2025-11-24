import { Component, OnInit } from '@angular/core';
import { DemoStateService, ParseResults } from '../demostate.service';

@Component({
  selector: 'app-point-label-checker',
  templateUrl: './point-label-checker.component.html',
  styleUrls: ['./point-label-checker.component.css']
})
export class PointLabelCheckerComponent implements OnInit {
  parseResults: ParseResults | null = null;

  constructor(private demoStateService: DemoStateService) {}

  ngOnInit(): void {
    const parseResults = this.demoStateService.getParseResults();
    if (!parseResults) {
      console.error('No parse results found');
      return;
    }
    // rewrite the key of each result in parseResults.errors to a new string where the '|' character is replaced with a newline
    const newErrors: Map<string, string[]> = new Map();
    for (const [key, value] of Object.entries(parseResults.errors)) {
      newErrors.set(key.replaceAll('| ', '\n'), value);
    }
    parseResults.errors = newErrors;
    this.parseResults = parseResults;
    console.log('parseResults', this.parseResults);
  }
}
