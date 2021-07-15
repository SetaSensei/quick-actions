import * as dice from '../../../systems/dnd5e/module/dice.js'

CONFIG.debug.hooks = true
var advMode = "normal"
var rollMode = "publicroll"
var player = null

function _setRollMode(event) {
    rollMode = _updateToggleUI(event, ".roll-mod")
    var actor = game.actors.get(player)
    actor.rollMode = rollMode
}

function _setAdvMode(event) {
    advMode = _updateToggleUI(event, ".adv-mode")
    var actor = game.actors.get(player)
    actor.advMode = advMode
}

function _updateToggleUI(event, className) {
    $(event.currentTarget).parent().children(className).removeClass("active")
    $(event.currentTarget).addClass("active")

    return event.currentTarget.dataset.value
}

async function _quickRollAttack(event) {
    var control = event.currentTarget
    var itemid = control.parentNode.dataset.itemid
    var actor = game.actors.get(player)
    var attackEntity = actor.data.items.find(i => i.id === itemid)

    var spellLevels = []

    var currentLevel = 0

    if (attackEntity.data._source.type == "spell" && attackEntity.data._source.data.level != 0) {
        for (let i = attackEntity.data._source.data.level; i < 10; i++) {
            spellLevels.push(i)
        }

        var spellcontent = await renderTemplate('modules/quick-action/templates/spell-dialog.hbs', {
            item: attackEntity.data,
            spellLevels
        })

        var dialog = new Dialog({
            title: game.i18n.localize("DND5E.SpellCastUpcast"),
            content: spellcontent,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Ok",
                    callback: (event) => {
                        currentLevel = event.find("select[data-name='spellupcast']").val()
                        _sendRoll(actor, attackEntity, currentLevel)
                    }
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => console.log("Chose Two")
                }
            },
            default: "two",
            render: html => console.log("Register interactivity in the rendered dialog"),
            close: html => console.log("This always is logged no matter which option is chosen")
        });
        dialog.render(true);
        return;
    } else {
        _sendRoll(actor, attackEntity, currentLevel)
    }
}

async function _sendRoll(actor, attackEntity, currentLevel = 0) {
    if (attackEntity.hasDamage) {
        console.log("Has Damage")
    }

    var d = attackEntity.getAttackToHit()


    if (d == null) {
        var spellDesc = await renderTemplate('modules/quick-action/templates/spell-damage-only.hbs', {
            title: attackEntity.data.name,
            actor: actor.id,
            weapon: attackEntity.id,
            img: attackEntity.data.img,
            description: attackEntity.data.data.description.value,
            spellLevel: attackEntity.labels.level,
            save: attackEntity.labels.save,
            components: attackEntity.labels.components.join(',')
        })

        attackEntity.rollDamage({
            spellLevel: currentLevel,
            options: {
                fastForward: true,
                flavor: spellDesc
            }
        })
        return;
    }

    const actions = await renderTemplate('modules/quick-action/templates/roll.hbs', {
        title: attackEntity.data.name,
        actor: actor.id,
        weapon: attackEntity.id,
        img: attackEntity.data.img,
        spellLevel: currentLevel,
        description: attackEntity.data.data.description.value
    })

    dice.d20Roll({
        parts: d.parts,
        critical: 20,
        data: d.rollData,
        rollMode: rollMode,
        advantage: advMode == "advantage",
        disadvantage: advMode == "disadvantage",
        fastForward: true,
        title: attackEntity.name,
        messageData: {},
        flavor: actions
        //flavor : "<div class='card-button'><button data-action='damage' class='attack-roll' data-actorid = " + actor.id + " data-weaponid=" + weapon.id + ">Damage</button></div>"
    })
}

function _quickRoll(event) {
    console.log(event)
    var control = event.currentTarget

    var itemid = control.parentNode.dataset.itemid

    var parents = $(control).parentsUntil('.qaction-container')

    var container = parents[parents.length - 1].parentNode

    var actor = game.actors.get(container.dataset.actorid)

    var weapon = actor.data.items.find(i => i._id === itemid)

    var dRoll = dice.damageRoll({
        parts: [weapon.labels.toHit],
        data: {}, // Roll creation
        advantage: true,
        disadvantage: false,
        fumble: 1,
        critical: 20,
        targetValue: null,
        elvenAccuracy: false,
        halflingLucky: false,
        reliableTalent: null, // Roll customization
        chooseModifier: false,
        fastForward: true,
        event: null,
        template: null,
        title: "elo",
        dialogOptions: null, // Dialog configuration
        chatMessage: true,
        messageData: {},
        rollMode: null,
        speaker: null,
        flavor: "<button data-action='attack'>Attack</button>" // Chat Message customization
    })
}

async function addActionsTab(app, html, data) {
    const actionsTabButton = $('<a class="item" data-tab="actions"> Q-Actions </a>');
    const tabs = html.find('.tabs[data-group="primary"]');
    tabs.prepend(actionsTabButton);
    const sheetBody = html.find('.sheet-body');
    const actionsTab = $(`<div class="tab actions flexcol" data-group="primary" data-tab="actions"></div>`);
    sheetBody.prepend(actionsTab);

    const actions = $(await renderTemplate('modules/quick-action/templates/actions.hbs', data))
    actionsTab.append(actions)

    var quickroll = actionsTab.find('div .quick-rollable');
    quickroll.on('click', event => _quickRollAttack(event));

    var adv = actionsTab.find('.adv-mode');
    adv.on('click', event => _setAdvMode(event))

    var mods = actionsTab.find('.roll-mod');
    mods.on('click', event => _setRollMode(event))
}

function rollAttack(event) {
    const actor = game.actors.get(event.target.dataset.actorid)
    const weapon = actor.data.items.find(i => i.id === event.target.dataset.weaponid)

    weapon.rollDamage({
        options: {
            fastForward: true,
            critical: event.data.isCrit
        }
    })
}

Hooks.once('init', async function () {
    console.log('Initializing ...')
});

Hooks.once('ready', async function () {
    console.log('Readying ...')
});

Hooks.on('renderActorSheet5e', async (app, html, data) => {
    player = data.options.token.data.actorId

    var weapons = []
    var spellbook = data.spellbook

    if (data.advmode == null) {
        data.advmode = "normal"
    }

    data.inventory.forEach(item => {
        if (item.label === 'DND5E.ItemTypeWeaponPl') {
            weapons = item.items
        }
    });



    addActionsTab(app, html, {
        "weapons": weapons,
        "spellbook": spellbook,
        "actorId": player,
        "disadvantage": data.advmode == "disadvantage",
        "normal": data.advmode == "normal",
        "advantage": data.advmode == "advantage",
        "public": data.mode = "public"
    })



})

Hooks.on('renderChatMessage', async (app, html, data) => {
    const atk = html.find('button[data-action="damage"]')
    const hasCritical = html.find('.critical')

    if (atk.length == 0)
        return
    atk.on('click', { isCrit : hasCritical != null } ,rollAttack)
})