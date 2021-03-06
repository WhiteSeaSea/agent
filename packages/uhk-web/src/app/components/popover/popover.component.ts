import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnChanges,
    Output,
    SimpleChanges,
    ViewChild
} from '@angular/core';
import { animate, keyframes, state, style, transition, trigger } from '@angular/animations';
import { IconDefinition } from '@fortawesome/fontawesome-common-types';
import { faBan, faClone, faKeyboard, faMousePointer, faPlay } from '@fortawesome/free-solid-svg-icons';

import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import {
    KeyAction,
    Keymap,
    KeystrokeAction,
    MouseAction,
    PlayMacroAction,
    SecondaryRoleAction,
    SwitchKeymapAction,
    SwitchLayerAction
} from 'uhk-common';

import { Tab } from './tab';

import { AppState, extraMouseButtonsSupported, getKeymapOptions, getKeymaps, macroPlaybackSupported } from '../../store';
import { KeyActionRemap } from '../../models/key-action-remap';
import { RemapInfo } from '../../models/remap-info';
import { SelectOptionData } from '../../models/select-option-data';
import { faSquareA } from '../../custom-fa-icons';

enum TabName {
    Keypress,
    Layer,
    Mouse,
    Macro,
    Keymap,
    None
}

export interface TabHeader {
    text: string;
    icon: IconDefinition;
    tabName: TabName;
    disabled?: boolean;
}

@Component({
    selector: 'popover',
    templateUrl: './popover.component.html',
    styleUrls: ['./popover.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('popover', [
            state('closed', style({
                transform: 'translateY(30px)',
                visibility: 'hidden',
                opacity: 0
            })),
            state('opened', style({
                transform: 'translateY(0)',
                visibility: 'visible',
                opacity: 1
            })),
            transition('opened => closed', [
                animate('{{animationTime}} ease-out', keyframes([
                    style({transform: 'translateY(0)', visibility: 'visible', opacity: 1, offset: 0}),
                    style({transform: 'translateY(30px)', visibility: 'hidden', opacity: 0, offset: 1})
                ]))
            ], { params: { animationTime: '200ms' } }),
            transition('closed => opened', [
                style({
                    visibility: 'visible'
                }),
                animate('{{animationTime}} ease-out', keyframes([
                    style({transform: 'translateY(30px)', opacity: 0, offset: 0}),
                    style({transform: 'translateY(0)', opacity: 1, offset: 1})
                ]))
            ], { params: { animationTime: '200ms' } })
        ])
    ]
})
export class PopoverComponent implements OnChanges {
    @Input() animationEnabled: boolean;
    @Input() defaultKeyAction: KeyAction;
    @Input() currentKeymap: Keymap;
    @Input() currentLayer: number;
    @Input() keyPosition: any;
    @Input() wrapPosition: any;
    @Input() visible: boolean;
    @Input() allowLayerDoubleTap: boolean;
    @Input() remapInfo: RemapInfo;

    @Output() cancel = new EventEmitter<any>();
    @Output() remap = new EventEmitter<KeyActionRemap>();

    @ViewChild('tab', { static: false }) selectedTab: Tab;
    @ViewChild('popover', { static: false }) popoverHost: ElementRef;

    tabName = TabName;
    keyActionValid: boolean;
    activeTab: TabName;
    keymaps$: Observable<Keymap[]>;
    keymapOptions$: Observable<SelectOptionData[]>;
    leftArrow: boolean = false;
    rightArrow: boolean = false;
    topPosition: number = 0;
    leftPosition: number = 0;
    animationState: string;
    shadowKeyAction: KeyAction;
    disableRemapOnAllLayer = false;
    tabHeaders: TabHeader[] = [
        {
            tabName: TabName.Keypress,
            icon: faSquareA,
            text: 'Keypress'
        },
        {
            tabName: TabName.Layer,
            icon: faClone,
            text: 'Layer'
        },
        {
            tabName: TabName.Mouse,
            icon: faMousePointer,
            text: 'Mouse'
        },
        {
            tabName: TabName.Macro,
            icon: faPlay,
            text: 'Macro'
        },
        {
            tabName: TabName.Keymap,
            icon: faKeyboard,
            text: 'Keymap'
        },
        {
            tabName: TabName.None,
            icon: faBan,
            text: 'None'
        }
    ];
    macroPlaybackSupported$: Observable<boolean>;
    extraMouseButtonsSupported$: Observable<boolean>;

    constructor(private store: Store<AppState>,
                private cdRef: ChangeDetectorRef) {
        this.animationState = 'closed';
        this.keymaps$ = store.select(getKeymaps);
        this.keymapOptions$ = store.select(getKeymapOptions);
        this.macroPlaybackSupported$ = store.select(macroPlaybackSupported);
        this.extraMouseButtonsSupported$ = store.select(extraMouseButtonsSupported);
    }

    ngOnChanges(change: SimpleChanges) {
        let tab: TabHeader = this.tabHeaders[5];

        if (this.keyPosition && this.wrapPosition && (change['keyPosition'] || change['wrapPosition'])) {
            this.calculatePosition();
        }

        if (change['defaultKeyAction']) {
            this.disableRemapOnAllLayer = false;

            if (this.defaultKeyAction instanceof KeystrokeAction) {
                this.keystrokeActionChange(this.defaultKeyAction);
                tab = this.tabHeaders[0];
            } else if (this.defaultKeyAction instanceof SwitchLayerAction) {
                tab = this.tabHeaders[1];
            } else if (this.defaultKeyAction instanceof MouseAction) {
                tab = this.tabHeaders[2];
            } else if (this.defaultKeyAction instanceof PlayMacroAction) {
                tab = this.tabHeaders[3];
            } else if (this.defaultKeyAction instanceof SwitchKeymapAction) {
                tab = this.tabHeaders[4];
            } else {
                tab = this.tabHeaders[5];
            }

            for (const tabHeader of this.tabHeaders) {
                const allowOnlyLayerTab = tab.tabName === TabName.Layer && this.currentLayer !== 0;

                tabHeader.disabled = allowOnlyLayerTab && tabHeader.tabName !== TabName.Layer;
            }
        }

        if (change['visible']) {
            if (change['visible'].currentValue) {
                this.animationState = 'opened';

                this.selectTab(tab);
            } else {
                this.animationState = 'closed';
            }
        }
    }

    get animationTime(): string {
        return this.animationEnabled ? '200ms' : '0ms';
    }

    onCancelClick(): void {
        this.cancel.emit(undefined);
    }

    onRemapKey(): void {
        if (this.keyActionValid) {
            try {
                this.remap.emit({
                    remapOnAllKeymap: this.remapInfo.remapOnAllKeymap,
                    remapOnAllLayer: this.remapInfo.remapOnAllLayer,
                    action: this.selectedTab.toKeyAction()
                });
            } catch (e) {
                // TODO: show error dialog
                console.error(e);
            }
        }
    }

    @HostListener('keydown.escape')
    onEscape(): void {
        this.cancel.emit();
    }

    @HostListener('document:keydown.control.enter', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        if (this.visible) {
            this.onRemapKey();
            event.preventDefault();
        }
    }

    selectTab(tab: TabHeader): void {
        if (tab.disabled) {
            return;
        }

        this.activeTab = tab.tabName;
        if (tab.tabName === TabName.Keypress) {
            this.keystrokeActionChange(this.defaultKeyAction as KeystrokeAction);
        }
    }

    onOverlay() {
        this.cancel.emit(undefined);
    }

    remapInfoChange(): void {
        this.selectedTab.remapInfoChanged(this.remapInfo);
    }

    keystrokeActionChange(keystrokeAction: KeystrokeAction): void {
        this.shadowKeyAction = keystrokeAction;
        const disableRemapOnAllLayer =
            keystrokeAction &&
            this.currentLayer === 0 &&
            (keystrokeAction.secondaryRoleAction === SecondaryRoleAction.fn ||
                keystrokeAction.secondaryRoleAction === SecondaryRoleAction.mod ||
                keystrokeAction.secondaryRoleAction === SecondaryRoleAction.mouse);

        if (this.disableRemapOnAllLayer !== disableRemapOnAllLayer) {
            this.disableRemapOnAllLayer = disableRemapOnAllLayer;

            if (disableRemapOnAllLayer) {
                this.remapInfo.remapOnAllLayer = false;
            }

            this.cdRef.markForCheck();
        }
    }

    setKeyActionValidState($event: boolean): void {
        this.keyActionValid = $event;
        this.cdRef.markForCheck();
    }

    trackTabHeader(index: number, tabItem: TabHeader): string {
        return tabItem.tabName.toString();
    }

    private calculatePosition() {
        const offsetLeft: number = this.wrapPosition.left + 265; // 265 is a width of the side menu with a margin
        const popover: HTMLElement = this.popoverHost.nativeElement;
        let newLeft: number = this.keyPosition.left + (this.keyPosition.width / 2);

        this.leftArrow = newLeft < offsetLeft;
        this.rightArrow = (newLeft + popover.offsetWidth) > offsetLeft + this.wrapPosition.width;

        if (this.leftArrow) {
            newLeft = this.keyPosition.left;
        } else if (this.rightArrow) {
            newLeft = this.keyPosition.left - popover.offsetWidth + this.keyPosition.width;
        } else {
            newLeft -= popover.offsetWidth / 2;
        }

        // 7 is a space between a bottom key position and a popover
        this.topPosition = this.keyPosition.top + this.keyPosition.height + 7 + window.scrollY;
        this.leftPosition = newLeft;
    }
}
