import { Component, OnInit } from '@angular/core';
import { ParserService, ParseResult, ParseToken, SuccessfulPointParse, FailedPointParse } from './naming.service';
import { DemoStateService } from '../demostate.service';
import {saveAs as importedSaveAs} from "file-saver";


interface NestedResults {
  success: "all" | "none" | "some"
  results: ParseResult
  selected: "all" | "none" | "some";
}

@Component({
  selector: 'app-naming',
  templateUrl: './naming.component.html',
  providers: [ParserService],
  styleUrls: ['./naming.component.css']
})
export class NamingComponent implements OnInit {
  pointlabelCSV: File | null = null;

  constructor(
    private ParserService: ParserService,
    private demoStateService: DemoStateService
  ) { }
  parserJson: File | null = null;
  // ground truth of results
  results: ParseResult = JSON.parse(localStorage.getItem("parse_results") ?? "[]");
  colorBySuccess = {'all': "#D9E8D9", "some": "#F6DDA2", "none": "#ECC1C1"};
  tableData: any[] = [];
  tableSchema: string[] = [];

  ngOnInit(): void {
    this.pointlabelCSV = this.demoStateService.getPointlistCSV();
    if (this.results) {
      this.asTableData();
      console.log(this.results);
      //this.initResultsByRule()
    }
  }

  handlePointLabelCSVInput(e: Event) { this.pointlabelCSV = (e?.target as HTMLInputElement)?.files?.[0] ?? null }
  handleParserJsonInput(e: Event) { this.parserJson = (e?.target as HTMLInputElement)?.files?.[0] ?? null }

  sendFiles() {
      // TODO: we are hardcoding the parser for now, but we will eventually want to support
      // uploads. Look at interop_metadata_applications/api/views/naming.py for more information
    if (!this.pointlabelCSV || !this.parserJson) return;
    this.ParserService.sendFiles(this.pointlabelCSV, this.parserJson)
      .subscribe({
        next: (data: ParseResult) => {
          this.results = data;
          console.log(this.results);
          localStorage.setItem('parse_results', JSON.stringify(this.results))

        }, // success path
        error: (error) => { } // error path
      });
  }

  // TODO: make a table?
  asTableData() {
      // rearrange this.results so it looks like tabular data. Put 'parsed' or 'failed' in a success attribute
    // have one column for each token in the tokens array. This requires figuring out
    // the maximum number of tokens in the array first.

      const tableData = [];
      let maxTokens = 0;
      for (const result of this.results.parsed) {
        if (result.tokens.length > maxTokens) {
          maxTokens = result.tokens.length;
        }
      }
      // Set up the table schema
      this.tableSchema = ['label'];
      for (let i = 0; i < maxTokens; i++) {
        this.tableSchema.push(i.toString());
      }

      // first loop through successful parses (SuccessfulPointParse in results.parsed)
      // and add them to the tableData array
      // then loop through failed parses (FailedPointParse in results.failed)
      // and add them to the tableData array

      for (const result of this.results.parsed) {
        // the row is {'label': result.label, 'success': 'parsed', 'token1': result.tokens[0], 'token2': result.tokens[1], ...}
        const tokens = [];
        for (let i = 0; i < result.tokens.length; i++) {
          // everything after the last '#'
          const brick_class = result.tokens[i].type.split('#').pop();
          tokens.push(`${result.tokens[i].identifier} (${brick_class})`);
        }
        const row = {'label': result.label, 'success': 'parsed', ...tokens};
        tableData.push(row);
      }
      this.tableData = tableData;
  }
}
